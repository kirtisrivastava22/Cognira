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
    split_documents,
    load_youtube_docs,
    llm
)

from app.export import router as export_router
from app.chapters import detect_chapters
from app.quiz import generate_quiz

from langchain_core.prompts import PromptTemplate
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
# STREAMING ASK (INLINE CITATIONS)
# =========================

@app.post("/ask_stream")
async def ask_stream(req: AskRequest):

    def token_generator():

        # STATUS START
        yield "data: " + json.dumps({
            "type": "status",
            "value": "started"
        }) + "\n\n"

        # -------------------------
        # STEP 1 — VECTORSTORE
        # -------------------------
        db = get_or_create_vectorstore(
            req.video_id,
            docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
        )

        if db is None:
            yield "data: " + json.dumps({
                "type": "answer",
                "value": "I don't know. No transcript available."
            }) + "\n\n"
            yield "data: " + json.dumps({"type": "end"}) + "\n\n"
            return

        # -------------------------
        # STEP 2 — RETRIEVE DOCS
        # -------------------------
        retriever = db.as_retriever(
            search_type="mmr",
            search_kwargs={
                "k": 18,
                "fetch_k": 60,
                "lambda_mult": 0.4
            }
        )

        docs = retriever.invoke(req.question)
        docs = rerank_docs_by_timestamp_density(docs)

        if not docs:
            yield "data: " + json.dumps({
                "type": "answer",
                "value": "I don't know."
            }) + "\n\n"
            yield "data: " + json.dumps({"type": "end"}) + "\n\n"
            return

        # -------------------------
        # STEP 3 — FORMAT CONTEXT
        # -------------------------
        def format_docs(docs):
            formatted = []
            for doc in docs:
                ts = doc.metadata.get("start", 0)
                mm, ss = divmod(ts, 60)

                formatted.append(
                    f"[{mm:02d}:{ss:02d}] {doc.page_content}"
                )

            return "\n\n".join(formatted)

        context = format_docs(docs)

        # -------------------------
        # STEP 4 — STRICT PROMPT
        # -------------------------
        prompt = PromptTemplate.from_template("""
You are a strict transcript analyst.

CRITICAL RULES:
- Use ONLY transcript context
- Every factual statement MUST include timestamp citations
- Citation format: [mm:ss]
- Multiple facts → multiple citations
- If answer missing → say exactly: I don't know
- No guessing
- No general knowledge
- 2–5 sentences max

Context:
{context}

Question:
{question}

Answer WITH citations:
""")

        chain = prompt | llm | StrOutputParser()

        # -------------------------
        # STEP 5 — STREAM TOKENS
        # -------------------------
        answer_text = ""

        for token in chain.stream({
            "context": context,
            "question": req.question
        }):
            answer_text += token

            yield "data: " + json.dumps({
                "type": "token",
                "value": token
            }) + "\n\n"

        # -------------------------
        # STEP 6 — UNKNOWN CHECK
        # -------------------------
        if "I don't know" in answer_text:
            yield "data: " + json.dumps({
                "type": "answer",
                "value": "I don't know. The video does not contain this information."
            }) + "\n\n"

            yield "data: " + json.dumps({"type": "end"}) + "\n\n"
            return

        # -------------------------
        # STEP 7 — EXTRACT INLINE CITATIONS
        # -------------------------
        matches = re.findall(r"\[(\d{2}:\d{2})\]", answer_text)

        timestamps = []
        seen = set()

        for m in matches:
            mm, ss = map(int, m.split(":"))
            seconds = mm * 60 + ss

            if seconds in seen:
                continue

            seen.add(seconds)

            timestamps.append({
                "seconds": seconds,
                "display": m
            })

        # -------------------------
        # STEP 8 — SEND CITATIONS
        # -------------------------
        yield "data: " + json.dumps({
            "type": "timestamps",
            "value": timestamps
        }) + "\n\n"

        # END STREAM
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
