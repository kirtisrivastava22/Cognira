import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    pipeline,
    BitsAndBytesConfig
)

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


# =========================
# LLM
# =========================

def load_llm():
    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=0,
        max_tokens=200,
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
        except:
            selected = transcript_list.find_generated_transcript(
                [t.language_code for t in transcript_list]
            )

        raw = selected.fetch()

    except:
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
# SPLITTER (better)
# =========================

def split_documents(docs):

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=600,
        chunk_overlap=120
    )

    chunks = []

    for doc in docs:
        splits = splitter.split_text(doc.page_content)
        for text in splits:
            chunks.append(
                Document(page_content=text, metadata={"start": doc.metadata["start"]})
            )

    return chunks


# =========================
# RERANKING
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
# RAG CHAIN
# =========================

def build_rag_chain(llm, retriever):

    def format_docs(docs):
        formatted = []
        for doc in docs:
            ts = doc.metadata.get("start", 0)
            mm, ss = divmod(ts, 60)
            formatted.append(f"[{mm:02d}:{ss:02d}] {doc.page_content}")
        return "\n\n".join(formatted)

    parallel = RunnableParallel({
        "context": retriever | RunnableLambda(format_docs),
        "question": RunnablePassthrough()
    })

    prompt = PromptTemplate.from_template(
"""You are a video transcript assistant and summarizer.

RULES:
- Use ONLY context below
- If answer not clearly present → say: I don't know
- NO guessing
- NO general knowledge
- NO apologies
- Answer directly and confidently
- 2 to 5 sentences max

Context:
{context}

Question: {question}

Answer:"""
)

    return parallel | prompt | llm | StrOutputParser()


# =========================
# ASK
# =========================

def ask_youtube_video(video_id, question):

    db = get_or_create_vectorstore(
        video_id,
        docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
    )

    retriever = db.as_retriever(
        search_type="mmr",
        search_kwargs={
            "k": 12,
            "fetch_k": 40,
            "lambda_mult": 0.5
        }
    )

    docs = retriever.invoke(question)
    docs = rerank_docs_by_timestamp_density(docs)

    if not docs:
        return {
            "answer": "I don't know",
            "timestamp": None,
            "video_id": video_id
        }

    chain = build_rag_chain(llm, retriever)
    answer = chain.invoke(question).strip()

    if answer.lower().startswith("i don't know"):
        return {
            "answer": "I don't know",
            "timestamp": None,
            "video_id": video_id
        }

    # best timestamp cluster
    best_doc = docs[0]
    ts = best_doc.metadata.get("start", 0)
    mm, ss = divmod(ts, 60)

    return {
        "answer": answer,
        "timestamp": ts,
        "timestamp_display": f"{mm:02d}:{ss:02d}",
        "video_id": video_id
    }
