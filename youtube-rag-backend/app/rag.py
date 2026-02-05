import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    pipeline,
    BitsAndBytesConfig
)

from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFacePipeline
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


# =========================
# LLM (Groq)
# =========================

def load_llm():
    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=0,
        max_tokens=150,
        streaming=True
    )

llm = load_llm()


# =========================
# Transcript helpers
# =========================

def ensure_iterable_transcript(transcript):
    if isinstance(transcript, list):
        return transcript
    if hasattr(transcript, "fetch"):
        return transcript.fetch()
    return list(transcript)


def normalize_chunk(chunk):
    if isinstance(chunk, dict):
        return {
            "text": chunk.get("text", ""),
            "start": int(chunk.get("start", 0))
        }

    if hasattr(chunk, "text") and hasattr(chunk, "start"):
        return {
            "text": chunk.text,
            "start": int(chunk.start)
        }

    raise ValueError("Unknown transcript chunk format")


# =========================
# Load YouTube Docs (NO TRANSLATION)
# =========================
from app.transcript_cache import (
    load_cached_transcript,
    save_transcript
)
def load_youtube_docs(video_id: str):
    # 1️⃣ Try cache first
    cached = load_cached_transcript(video_id)
    if cached:
        print("[load_youtube_docs] Loaded transcript from cache")
        return [
            Document(
                page_content=chunk["text"],
                metadata={"start": chunk["start"]}
            )
            for chunk in cached
        ]

    print("[load_youtube_docs] Cache miss → calling YouTube API")

    try:
        ytt = YouTubeTranscriptApi()
        transcript_list = ytt.list(video_id)

        try:
            selected = transcript_list.find_manually_created_transcript(
                [t.language_code for t in transcript_list]
            )
        except:
            selected = transcript_list.find_generated_transcript(
                [t.language_code for t in transcript_list]
            )

        raw_transcript = selected.fetch()

    except (NoTranscriptFound, TranscriptsDisabled, VideoUnavailable):
        print("[load_youtube_docs] No transcript available")
        return []
    except Exception as e:
        print("[load_youtube_docs] Error:", e)
        return []

    print("[load_youtube_docs] Transcript fetched from API")

    # 2️⃣ Normalize ONCE (this fixes everything)
    normalized = []
    docs = []

    for raw_chunk in ensure_iterable_transcript(raw_transcript):
        chunk = normalize_chunk(raw_chunk)

        if not chunk["text"].strip():
            continue

        normalized.append(chunk)

        docs.append(
            Document(
                page_content=chunk["text"],
                metadata={"start": chunk["start"]}
            )
        )

    # 3️⃣ Save normalized transcript to cache
    save_transcript(video_id, normalized)
    print("[load_youtube_docs] Transcript saved to cache")

    print(f"[load_youtube_docs] docs count = {len(docs)}")
    return docs

# =========================
# Split Documents
# =========================

def split_documents(docs):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100
    )

    chunks = []
    for doc in docs:
        splits = splitter.split_text(doc.page_content)
        for text in splits:
            chunks.append(
                Document(
                    page_content=text,
                    metadata={"start": doc.metadata["start"]}
                )
            )

    return chunks

# =========================
# MANUAL CHAPTER EXTRACTION (NO LLM)
# =========================

def extract_manual_chapters(transcript_docs, window_sec=120, max_chapters=8):
    if not transcript_docs:
        return []

    transcript_docs = sorted(transcript_docs, key=lambda d: d.metadata["start"])

    chapters = []
    bucket = []
    bucket_start = transcript_docs[0].metadata["start"]

    for doc in transcript_docs:
        ts = doc.metadata["start"]

        if ts - bucket_start <= window_sec:
            bucket.append(doc.page_content)
        else:
            mm, ss = divmod(bucket_start, 60)
            chapters.append({
                "time": f"{mm:02d}:{ss:02d}",
                "text": " ".join(bucket)
            })

            if len(chapters) >= max_chapters:
                return chapters

            bucket_start = ts
            bucket = [doc.page_content]

    if bucket and len(chapters) < max_chapters:
        mm, ss = divmod(bucket_start, 60)
        chapters.append({
            "time": f"{mm:02d}:{ss:02d}",
            "text": " ".join(bucket)
        })

    return chapters



# =========================
# RAG Chain
# =========================

def build_rag_chain(llm, retriever):
    def format_docs(docs):
        formatted = []
        for doc in docs:
            ts = doc.metadata.get("start", 0)
            mm, ss = divmod(ts, 60)
            timestamp = f"{mm:02d}:{ss:02d}"
            formatted.append(f"[{timestamp}] {doc.page_content}")
        return "\n\n".join(formatted)

    parallel = RunnableParallel({
        "context": retriever | RunnableLambda(format_docs),
        "question": RunnablePassthrough()
    })

    prompt = PromptTemplate.from_template(
        """You are a helpful video transcript assistant and a video explainer.

CRITICAL RULES:
1. Answer ONLY using the Context below
2. If the Context does not contain the answer, say exactly: "I don't know"
3. Do NOT make up information
4. Keep answers concise (2 to 6 sentences)

Context:
{context}

Question: {question}

Answer:"""
    )

    return parallel | prompt | llm | StrOutputParser()


def rerank_docs_by_timestamp_density(docs):
    if not docs:
        return docs

    # cluster around nearby timestamps
    scores = []
    for i, d in enumerate(docs):
        ts = d.metadata.get("start", 0)

        density = sum(
            1 for x in docs
            if abs(x.metadata.get("start", 0) - ts) <= 30
        )

        scores.append((density, i))

    scores.sort(reverse=True)
    return [docs[i] for _, i in scores]

# =========================
# Ask YouTube Video
# =========================

def ask_youtube_video(video_id, question):
    print("ask_youtube_video started")

    db = get_or_create_vectorstore(
        video_id,
        docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
    )

    retriever = db.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": 10,
            "fetch_k": 25,
            "lambda_mult": 0.5
        }
    )


    docs = retriever.invoke(question)
    docs = rerank_docs_by_timestamp_density(docs)


    if not docs:
        return {
            "answer": "I don't know. The video does not contain this information.",
            "timestamp": None,
            "video_id": video_id
        }

    chain = build_rag_chain(llm, retriever)
    answer = chain.invoke(question).strip()

    if "I don't know" in answer:
        return {
            "answer": "I don't know. The video does not contain this information.",
            "timestamp": None,
            "video_id": video_id
        }

    top_doc = docs[0]
    ts = top_doc.metadata.get("start", 0)
    mm, ss = divmod(ts, 60)

    return {
        "answer": answer,
        "timestamp": ts,
        "timestamp_display": f"{mm:02d}:{ss:02d}",
        "video_id": video_id
    }
