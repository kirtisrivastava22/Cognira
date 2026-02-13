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
        max_tokens=300,  # Increased for better answers
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
# STREAMING ASK (INLINE CITATIONS ONLY)
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
        # STEP 1 – VECTORSTORE
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
        # STEP 2 – RETRIEVE DOCS
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
        # STEP 3 – FORMAT CONTEXT
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
        # STEP 4 – ENHANCED PROMPT WITH SYSTEM MESSAGE
        # -------------------------
        prompt = ChatPromptTemplate.from_messages([
            ("system", """You are a video transcript analyst. Your job is to answer questions using ONLY the transcript provided.

MANDATORY RULES:
1. ALWAYS include timestamp citations [mm:ss] for every fact
2. Place timestamps INLINE in your sentences (not at the end)
3. Use multiple timestamps throughout your answer
4. If the answer isn't in the transcript, respond: "I don't know"
5. Keep answers 2-4 sentences
6. Never use outside knowledge

GOOD EXAMPLE:
"The main concept is introduced at [00:15] where the speaker explains that data preprocessing is crucial [01:30]. The three key steps are outlined at [02:45]."

BAD EXAMPLE:
"The main concept is data preprocessing and it has three key steps. [00:15]"
"""),
            ("user", """Context from video transcript:
{context}

Question: {question}

Answer with inline [mm:ss] timestamps:""")
        ])

        llm = get_streaming_llm()
        chain = prompt | llm | StrOutputParser()

        # -------------------------
        # STEP 5 – STREAM TOKENS
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
        # STEP 6 – UNKNOWN CHECK
        # -------------------------
        if "I don't know" in answer_text:
            yield "data: " + json.dumps({
                "type": "answer",
                "value": "I don't know. The video does not contain this information."
            }) + "\n\n"

            yield "data: " + json.dumps({"type": "end"}) + "\n\n"
            return

        # END STREAM (no separate timestamps event)
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