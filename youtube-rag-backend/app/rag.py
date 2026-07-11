import os

from langchain_groq import ChatGroq
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.runnables import (
    RunnableParallel,
    RunnablePassthrough,
    RunnableLambda
)
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable
)

from app.vectorstore import get_or_create_vectorstore
from app.transcript_cache import load_cached_transcript, save_transcript
from rank_bm25 import BM25Okapi
import numpy as np
import re


# =========================
# LLM
# =========================

# Replace load_llm and the global llm with this:
def load_llm():
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return None  # ← don't crash, just return None
    from langchain_groq import ChatGroq
    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=0,
        max_tokens=400,
        streaming=True
    )

llm = load_llm() 
# =========================
# TRANSCRIPT LOADER
# =========================

def load_youtube_docs(video_id: str):

    cached = load_cached_transcript(video_id)
    if cached:
        return [
            Document(page_content=c["text"], metadata={"start": c["start"]})
            for c in cached
        ]

    try:
        ytt = YouTubeTranscriptApi()
        transcript_list = ytt.list(video_id)

        try:
            selected = transcript_list.find_manually_created_transcript(
                [t.language_code for t in transcript_list]
            )
        except Exception:
            selected = transcript_list.find_generated_transcript(
                [t.language_code for t in transcript_list]
            )

        raw = selected.fetch()

    except Exception:
        return []

    normalized = []
    docs = []

    for chunk in raw:
        text = chunk.text.replace("\n", " ").strip()
        start = int(chunk.start)

        if not text:
            continue

        normalized.append({"text": text, "start": start})
        docs.append(Document(page_content=text, metadata={"start": start}))

    save_transcript(video_id, normalized)
    return docs


# =========================
# SPLITTER
# =========================

def split_documents(docs):
    """
    Sentence-aware chunking: prefer splitting on sentence boundaries.

    FIX: preserve ALL metadata fields from the source doc (not just "start").
    This is critical for docx docs which carry source="docx", paragraph=N, page=N.
    Without this, all metadata is lost after splitting and format_docs_with_references
    can't distinguish docx chunks from video chunks.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=80,
        separators=[". ", "? ", "! ", "\n", " ", ""],
    )

    chunks = []
    for doc in docs:
        splits = splitter.split_text(doc.page_content)
        for text in splits:
            text = text.strip()
            if len(text) < 20:
                continue
            # Copy ALL metadata from the parent doc, not just "start"
            chunks.append(
                Document(
                    page_content=text,
                    metadata=dict(doc.metadata)   # full copy
                )
            )

    return chunks


# =========================
# HYBRID BM25 + VECTOR RETRIEVAL
# =========================

def hybrid_retrieve(db, question: str, k: int = 14):
    """
    Combine FAISS MMR results with BM25 keyword results.
    Deduplicates and returns merged top-k documents.
    """
    # Semantic retrieval
    vector_docs = db.as_retriever(
        search_type="mmr",
        search_kwargs={"k": k, "fetch_k": 60, "lambda_mult": 0.45}
    ).invoke(question)

    # BM25 keyword retrieval over a larger candidate pool
    try:
        candidate_docs = db.similarity_search(question, k=80)
        corpus = [d.page_content for d in candidate_docs]
        tokenized_corpus = [doc.lower().split() for doc in corpus]
        bm25 = BM25Okapi(tokenized_corpus)
        scores = bm25.get_scores(question.lower().split())
        top_indices = np.argsort(scores)[::-1][:k]
        bm25_docs = [candidate_docs[i] for i in top_indices if scores[i] > 0]
    except Exception:
        bm25_docs = []

    # Merge, deduplicate (vector first, then bm25 fill)
    seen = set()
    merged = []
    for doc in vector_docs + bm25_docs:
        key = doc.page_content[:80]
        if key not in seen:
            seen.add(key)
            merged.append(doc)

    return merged[:k + 4]


# =========================
# TIMESTAMP-DENSITY RERANKING
# =========================

def rerank_docs_by_timestamp_density(docs):
    if not docs:
        return docs

    scored = []
    for i, d in enumerate(docs):
        ts = d.metadata.get("start", 0)
        density = sum(
            1 for x in docs
            if abs(x.metadata.get("start", 0) - ts) <= 40
        )
        scored.append((density, i))

    scored.sort(reverse=True)
    return [docs[i] for _, i in scored]


# =========================
# FORMAT DOCS FOR PROMPT
# =========================

def format_timestamp(seconds: int) -> str:
    """
    Format seconds as MM:SS for videos under an hour, H:MM:SS beyond that.

    Minutes/seconds are always zero-padded to 2 digits so downstream
    regexes (TIMESTAMP_RE) can rely on a fixed-width [MM:SS] / [H:MM:SS]
    shape no matter how long the video is. Without the hour rollover,
    a video past 99 minutes would produce e.g. "[105:23]", which
    TIMESTAMP_RE below (and the old \\d{2} regex) can't match.
    """
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


# Matches [MM:SS] or [H:MM:SS]. MM/SS are exactly 2 digits when part of the
# H:MM:SS form; the leading number is 1-4 digits when there's no hour group,
# because llama-3.1-8b-instant doesn't reliably preserve the "1:56:10"
# structure when citing from the excerpts — it commonly flattens it back to
# raw total minutes, e.g. "[116:10]" instead of "[1:56:10]" (116 min = 1h56m,
# seconds preserved correctly). Both shapes must parse to the same seconds.
TIMESTAMP_RE = re.compile(r'\[(\d{1,4}):(\d{2})(?::(\d{2}))?\]')


def parse_timestamp_match(match) -> int:
    """
    Convert a TIMESTAMP_RE match into total seconds.
    Three groups (a:b:c) -> H:MM:SS.
    Two groups (a:b)     -> MM:SS, where `a` may itself be >99 if the LLM
                             flattened the hour component into raw minutes.
    """
    a, b, c = match.group(1), match.group(2), match.group(3)
    if c is not None:
        return int(a) * 3600 + int(b) * 60 + int(c)
    return int(a) * 60 + int(b)


def format_docs_with_references(docs):
    """
    Format retrieved docs for the LLM prompt.

    docx docs  → [para N] prefix       (paragraph number from metadata)
    video docs → [MM:SS] / [H:MM:SS]   (timestamp from metadata, hour-aware
                                         so citations stay parseable on long videos)

    The LLM is instructed to cite these exact tags inline, which the
    frontend regex then converts to clickable buttons.
    """
    formatted = []

    for doc in docs:
        source = doc.metadata.get("source", "video")

        if source == "docx":
            para = doc.metadata.get("paragraph", 0)
            # Use [para N] format — matches frontend COMBINED_RE and prompt rules
            formatted.append(f"[para {para}] {doc.page_content}")
        else:
            ts = doc.metadata.get("start", 0)
            formatted.append(f"[{format_timestamp(ts)}] {doc.page_content}")

    return "\n\n".join(formatted)


# =========================
# STRICT RAG PROMPT
# =========================

_STRICT_PROMPT = PromptTemplate.from_template(
"""You are a strict transcript analyst. Your ONLY knowledge source is the transcript excerpts below.

RULES — follow every single one:
1. Use ONLY facts stated in the transcript. No outside knowledge. No inference. No guessing.
2. If the transcript does not clearly answer the question, reply exactly: I don't know
3. Every factual claim must include an inline reference taken EXACTLY from the excerpt header:
   - For video/audio: copy the reference exactly as it appears in the excerpt header — [MM:SS] e.g. [02:34], or [H:MM:SS] for longer videos e.g. [1:15:23]
   - For documents:   use [para N] e.g. [para 3]
   Always use square brackets. Never omit the reference.
4. Keep answers to 2-5 sentences.
5. Do not repeat the question.
6. Do not apologise or explain what you cannot do — just say "I don't know".

Excerpts (each prefixed with its reference — cite these inline):
{context}

Question: {question}

Answer (cite inline references or reply "I don't know"):"""
)


def build_rag_chain(llm, retriever):
    parallel = RunnableParallel({
        "context": retriever | RunnableLambda(format_docs_with_references),
        "question": RunnablePassthrough()
    })
    return parallel | _STRICT_PROMPT | llm | StrOutputParser()


# =========================
# HALLUCINATION GUARD
# =========================

def _looks_like_hallucination(answer: str, docs) -> bool:
    """
    If the answer cites timestamps not present in the retrieved docs,
    flag it as a likely hallucination.
    """
    if not answer or "i don't know" in answer.lower():
        return False

    answer_matches = list(TIMESTAMP_RE.finditer(answer))
    if not answer_matches:
        return False   # no timestamp citations — cannot judge

    doc_seconds = set()
    for doc in docs:
        ts = int(doc.metadata.get("start", 0))
        doc_seconds.add(ts)

    for match in answer_matches:
        cited_sec = parse_timestamp_match(match)
        if any(abs(cited_sec - ds) <= 15 for ds in doc_seconds):
            return False   # at least one valid match found

    return True   # all cited timestamps are foreign — suspicious


# =========================
# ASK
# =========================

def ask_youtube_video(video_id, question):

    db = get_or_create_vectorstore(
        video_id,
        docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
    )

    if db is None:
        return {
            "answer": "I don't know — no transcript is available for this video.",
            "timestamps": [],
            "video_id": video_id
        }

    # Hybrid retrieval + rerank
    docs = hybrid_retrieve(db, question, k=14)
    docs = rerank_docs_by_timestamp_density(docs)

    if not docs:
        return {"answer": "I don't know", "timestamps": [], "video_id": video_id}

    # Run chain
    retriever = db.as_retriever(
        search_type="mmr",
        search_kwargs={"k": 14, "fetch_k": 60, "lambda_mult": 0.45}
    )
    if llm is None:
        return {
            "answer": "LLM not configured on server — answers run in browser.",
            "timestamps": [],
            "video_id": video_id
        }
    chain = build_rag_chain(llm, retriever)
    answer = chain.invoke(question).strip()

    # Reject hallucinations / unknown answers
    if answer.lower().startswith("i don't know") or _looks_like_hallucination(answer, docs):
        return {
            "answer": "I don't know — the video does not contain enough information to answer this.",
            "timestamps": [],
            "video_id": video_id
        }

    # Collect timestamps: inline citations first, then top docs
    timestamps = []
    seen_seconds = set()

    for match in TIMESTAMP_RE.finditer(answer):
        seconds = parse_timestamp_match(match)
        if not any(abs(seconds - s) < 30 for s in seen_seconds):
            seen_seconds.add(seconds)
            timestamps.append({"seconds": seconds, "display": format_timestamp(seconds)})

    for doc in docs:
        ts = int(doc.metadata.get("start", 0))
        if not any(abs(ts - s) < 30 for s in seen_seconds):
            seen_seconds.add(ts)
            timestamps.append({"seconds": ts, "display": format_timestamp(ts)})
        if len(timestamps) >= 5:
            break

    return {
        "answer": answer,
        "timestamps": timestamps,
        "video_id": video_id
    }