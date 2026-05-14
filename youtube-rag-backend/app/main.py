from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import json
import re

from app.rag import (
    ask_youtube_video,
    build_rag_chain,
    get_or_create_vectorstore,
    rerank_docs_by_timestamp_density,
    hybrid_retrieve,
    split_documents,
    load_youtube_docs,
    format_docs_with_timestamps,
    _looks_like_hallucination,
)

from langchain_groq import ChatGroq
from app.export import router as export_router
from app.chapters import detect_chapters
from app.quiz import generate_quiz

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser


# =========================
# APP INIT
# =========================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# REQUEST MODEL
# =========================

class AskRequest(BaseModel):
    video_id: str
    question: str


# =========================
# LLM FOR STREAMING
# =========================

def get_streaming_llm():
    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=0,
        max_tokens=400,
        streaming=True
    )


# =========================
# NORMAL ASK (non-stream)
# =========================

@app.post("/ask")
def ask(req: AskRequest):
    try:
        if not req.video_id or not req.question:
            raise HTTPException(status_code=400, detail="Missing fields")

        answer = ask_youtube_video(req.video_id, req.question)

        return {
            "answer": answer,
            "video_id": req.video_id
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# =========================
# STREAMING ASK
# =========================

# Stricter system prompt — the critical change for stopping hallucinations
_STREAM_SYSTEM = """You are a strict transcript analyst. Your ONLY knowledge source is the transcript excerpts the user provides.

ABSOLUTE RULES — never break them:
1. Use ONLY information stated in the provided transcript excerpts. Zero outside knowledge.
2. If the transcript does not clearly contain the answer, reply with exactly: I don't know
3. Every factual claim must have an inline timestamp [mm:ss] taken from the excerpt headers.
4. Do NOT invent, infer, extrapolate, or guess. If you are uncertain, say "I don't know".
5. Keep your answer to 2–5 sentences.
6. Do not repeat the question or explain what you cannot do."""

_STREAM_USER = """Transcript excerpts (each line starts with its timestamp):
{context}

Question: {question}

Answer using ONLY the excerpts above (with inline [mm:ss] timestamps), or reply "I don't know":"""


@app.post("/ask_stream")
async def ask_stream(req: AskRequest):

    def token_generator():

        yield "data: " + json.dumps({"type": "status", "value": "started"}) + "\n\n"

        # ── Step 1: vectorstore ──────────────────────────────────────
        db = get_or_create_vectorstore(
            req.video_id,
            docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
        )

        if db is None:
            yield "data: " + json.dumps({
                "type": "answer",
                "value": "I don't know — no transcript is available for this video."
            }) + "\n\n"
            yield "data: " + json.dumps({"type": "end"}) + "\n\n"
            return

        # ── Step 2: hybrid retrieval + rerank ────────────────────────
        docs = hybrid_retrieve(db, req.question, k=14)
        docs = rerank_docs_by_timestamp_density(docs)

        if not docs:
            yield "data: " + json.dumps({
                "type": "answer",
                "value": "I don't know."
            }) + "\n\n"
            yield "data: " + json.dumps({"type": "end"}) + "\n\n"
            return

        # ── Step 3: format context ───────────────────────────────────
        context = format_docs_with_timestamps(docs)

        # ── Step 4: build prompt and stream ─────────────────────────
        prompt = ChatPromptTemplate.from_messages([
            ("system", _STREAM_SYSTEM),
            ("user", _STREAM_USER)
        ])

        llm = get_streaming_llm()
        chain = prompt | llm | StrOutputParser()

        answer_text = ""
        for token in chain.stream({"context": context, "question": req.question}):
            answer_text += token
            yield "data: " + json.dumps({"type": "token", "value": token}) + "\n\n"

        # ── Step 5: post-generation quality guard ────────────────────
        is_idk = "i don't know" in answer_text.lower()
        is_hallucination = _looks_like_hallucination(answer_text, docs)

        if is_idk or is_hallucination:
            # Signal the frontend to replace the streamed text
            yield "data: " + json.dumps({
                "type": "correction",
                "value": "I don't know — the video does not contain enough information to answer this."
            }) + "\n\n"

        yield "data: " + json.dumps({"type": "end"}) + "\n\n"

    return StreamingResponse(
        token_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# =========================
# CHAPTERS
# =========================

@app.get("/chapters/{video_id}")
def get_chapters(video_id: str):
    return detect_chapters(video_id)


# =========================
# QUIZ
# =========================

@app.get("/quiz/{video_id}")
def get_quiz(video_id: str, num_questions: int = 5):
    return generate_quiz(video_id, num_questions)


# =========================
# EXPORT
# =========================

app.include_router(export_router)