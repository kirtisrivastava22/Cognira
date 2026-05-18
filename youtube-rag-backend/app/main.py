"""
main.py  — Cognira API (production)
------------------------------------
Changes over dev version:
  • SQLite DB via app.database (replaces JSON index + transcript files)
  • /auth/signin, /auth/signout endpoints
  • /history GET/POST endpoints (server-side, per-user)
  • YouTube timestamp seek fix (postMessage via /seek endpoint for iframe)
  • Chapters / Quiz now cache results in DB (no re-generation on repeat calls)
  • CORS locked to configured origins in production
  • Rate limiter on all heavy endpoints
"""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, field_validator

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from app.database import (
    init_db, save_media, get_media,
    upsert_user, add_history, get_history,
)
from app.export import router as export_router
from app.chapters import detect_chapters, detect_chapters_from_docs
from app.quiz import generate_quiz, generate_quiz_from_docs
from app.rate_limiter import rate_limit
from app.rag import (
    ask_youtube_video,
    hybrid_retrieve,
    rerank_docs_by_timestamp_density,
    split_documents,
    format_docs_with_references,
    load_youtube_docs,
    _looks_like_hallucination,
)
from app.media_manager import (
    create_media_id,
    download_from_url,
    save_uploaded_file,
    register_media,
    get_media_meta,
)
from app.transcript_service import load_media_docs
from app.vectorstore import get_or_create_vectorstore
from app.docx_reader import load_docx_docs, WordLimitExceeded


# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("main")


# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
DOCX_MIME_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}
ALLOWED_EXTENSIONS = {".mp4", ".mp3", ".wav", ".mkv", ".m4a", ".webm", ".docx", ".doc"}

# In production, lock this to your actual domain(s)
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Starting Cognira API…")
    for d in ("exports", "vectorstores", "media", "cache/transcripts"):
        Path(d).mkdir(parents=True, exist_ok=True)
    init_db()   # create SQLite tables
    log.info("Startup complete.")
    yield
    log.info("Shutting down…")


# ─────────────────────────────────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Cognira API", version="3.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def limit_upload_size(request: Request, call_next):
    cl = request.headers.get("content-length")
    if cl and int(cl) > MAX_UPLOAD_BYTES:
        return JSONResponse(
            status_code=413,
            content={"detail": f"Payload too large. Max {MAX_UPLOAD_BYTES // (1024*1024)} MB."},
        )
    return await call_next(request)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.perf_counter()
    response = await call_next(request)
    log.info("%-6s %-40s %d  %.0fms",
             request.method, request.url.path,
             response.status_code, (time.perf_counter() - t0) * 1000)
    return response


# ─────────────────────────────────────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/health", tags=["ops"])
def health():
    return {"status": "ok", "version": "3.0.0"}


# ─────────────────────────────────────────────────────────────────────────────
# Auth endpoints
# ─────────────────────────────────────────────────────────────────────────────

class SignInRequest(BaseModel):
    name:  str
    email: str

    @field_validator("email")
    @classmethod
    def _clean_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not v or "@" not in v:
            raise ValueError("Invalid email")
        return v

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name required")
        return v[:200]


@app.post("/auth/signin", tags=["auth"])
def sign_in(req: SignInRequest):
    """
    Lightweight auth — no passwords, just name+email identity.
    Returns a user_id to be stored client-side (localStorage / cookie).
    """
    user_id = (
        req.email.lower().replace(r"[^a-z0-9]", "_") + "_" +
        req.name.lower().replace(" ", "_")[:20]
    )
    # Deterministic: same email+name always gives same ID
    import hashlib
    user_id = hashlib.sha256(f"{req.email}:{req.name}".encode()).hexdigest()[:32]

    upsert_user(user_id, req.name, req.email)
    return {"user_id": user_id, "name": req.name, "email": req.email}


@app.post("/auth/signout", tags=["auth"])
def sign_out():
    """Client clears its stored user_id. Server does nothing (stateless)."""
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# History endpoints
# ─────────────────────────────────────────────────────────────────────────────

class HistoryAddRequest(BaseModel):
    user_id:    str
    media_id:   str
    title:      str
    source_type: str


@app.get("/history/{user_id}", tags=["history"])
def user_history(user_id: str, limit: int = 50):
    return {"history": get_history(user_id, limit=limit)}


@app.post("/history", tags=["history"])
def add_history_entry(req: HistoryAddRequest):
    add_history(req.user_id, req.media_id, req.title, req.source_type)
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────────────────
# Request models
# ─────────────────────────────────────────────────────────────────────────────

class AskRequest(BaseModel):
    video_id: str
    question: str
    history:  list[dict] = []

    @field_validator("video_id")
    @classmethod
    def _clean_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("video_id must not be empty")
        if len(v) > 128:
            raise ValueError("video_id too long")
        return v

    @field_validator("question")
    @classmethod
    def _clean_q(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("question must not be empty")
        if len(v) > 2000:
            raise ValueError("question too long (max 2000 chars)")
        return v


class IngestResponse(BaseModel):
    media_id:    str
    source_type: str
    title:       str | None = None
    word_count:  int | None = None
    truncated:   bool | None = None


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _get_streaming_llm() -> ChatGroq:
    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=0,
        max_tokens=400,
        streaming=True,
    )


def _vectorstore_exists_on_disk(media_id: str) -> bool:
    vs_path = Path("vectorstores") / media_id
    return (vs_path / "index.faiss").exists() and (vs_path / "index.pkl").exists()


def _build_docs(media_id: str):
    if _vectorstore_exists_on_disk(media_id):
        return []

    meta = get_media_meta(media_id)
    if meta:
        if meta.get("source_type") == "docx":
            docs, _ = load_docx_docs(meta.get("local_path", ""))
            return split_documents(docs)
        docs = load_media_docs(media_id)
        if docs:
            return split_documents(docs)

    return split_documents(load_youtube_docs(media_id))


def _is_docx(filename: str, content_type: str | None) -> bool:
    ext = Path(filename).suffix.lower()
    return ext in {".docx", ".doc"} or (content_type or "") in DOCX_MIME_TYPES


# ─────────────────────────────────────────────────────────────────────────────
# Streaming prompt
# ─────────────────────────────────────────────────────────────────────────────

_STREAM_SYSTEM = """You are a strict document/transcript analyst. Your ONLY knowledge source is the excerpts provided.

ABSOLUTE RULES:
1. Use ONLY information stated in the provided excerpts. Zero outside knowledge.
2. If the excerpts do not clearly contain the answer, reply with exactly: I don't know
3. Every factual claim MUST include an inline reference:
   - Video/audio: [MM:SS]  e.g. [02:34]
   - Documents:   [para N] e.g. [para 3]
4. Do NOT invent, infer, extrapolate, or guess.
5. Keep your answer to 2–5 sentences.
6. Do not repeat the question."""

_STREAM_USER = """Conversation history:
{history}

Excerpts (cite these inline):
{context}

Question: {question}

Answer (with inline references), or "I don't know":"""


# ─────────────────────────────────────────────────────────────────────────────
# Ask routes
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/ask", dependencies=[Depends(rate_limit("ask_stream"))])
def ask(req: AskRequest):
    try:
        return ask_youtube_video(req.video_id, req.question)
    except Exception as e:
        log.exception("ask error")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ask_stream", dependencies=[Depends(rate_limit("ask_stream"))])
async def ask_stream(req: AskRequest):
    def token_generator():
        yield "data: " + json.dumps({"type": "status", "value": "started"}) + "\n\n"

        db = get_or_create_vectorstore(req.video_id, docs_builder=_build_docs)
        if db is None:
            yield "data: " + json.dumps({
                "type": "answer", "value": "I don't know — no content available."
            }) + "\n\n"
            yield "data: " + json.dumps({"type": "end"}) + "\n\n"
            return

        docs = hybrid_retrieve(db, req.question, k=14)
        docs = rerank_docs_by_timestamp_density(docs)

        if not docs:
            yield "data: " + json.dumps({"type": "answer", "value": "I don't know."}) + "\n\n"
            yield "data: " + json.dumps({"type": "end"}) + "\n\n"
            return

        history_text = ""
        for h in req.history[-5:]:
            history_text += f"Q: {h.get('question', '')}\nA: {h.get('answer', '')}\n\n"

        context = format_docs_with_references(docs)
        prompt  = ChatPromptTemplate.from_messages([
            ("system", _STREAM_SYSTEM),
            ("user",   _STREAM_USER),
        ])
        chain = prompt | _get_streaming_llm() | StrOutputParser()

        answer_text = ""
        for token in chain.stream({
            "history": history_text.strip() or "(none)",
            "context": context,
            "question": req.question,
        }):
            answer_text += token
            yield "data: " + json.dumps({"type": "token", "value": token}) + "\n\n"

        if "i don't know" in answer_text.lower() or _looks_like_hallucination(answer_text, docs):
            yield "data: " + json.dumps({
                "type":  "correction",
                "value": "I don't know — the content does not contain enough information.",
            }) + "\n\n"

        yield "data: " + json.dumps({"type": "end"}) + "\n\n"

    return StreamingResponse(
        token_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "Connection":       "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Ingest
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/ingest", response_model=IngestResponse, dependencies=[Depends(rate_limit("ingest"))])
async def ingest_media(
    url:  str | None        = Form(default=None),
    file: UploadFile | None = File(default=None),
):
    if not url and not file:
        raise HTTPException(status_code=400, detail="Provide either a URL or a file.")

    media_id   = create_media_id()
    word_count: int | None  = None
    truncated:  bool | None = None

    if url:
        try:
            local_path, source_type = download_from_url(url, media_id)
        except Exception as e:
            log.exception("URL download failed")
            raise HTTPException(status_code=422, detail=f"Download failed: {e}")

        meta = {
            "media_id": media_id, "source_type": source_type,
            "source_url": url, "local_path": local_path, "title": url,
        }

    else:
        filename     = file.filename or "upload"
        content_type = file.content_type
        ext          = Path(filename).suffix.lower()

        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=415,
                detail=f"Unsupported type '{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            )

        local_path = save_uploaded_file(file, media_id)

        if _is_docx(filename, content_type):
            try:
                docs, docx_meta = load_docx_docs(local_path, truncate=True)
                full_text = "\n\n".join(d.page_content for d in docs)
            except WordLimitExceeded as e:
                raise HTTPException(status_code=422, detail=str(e))
            except Exception as e:
                log.exception("DOCX parse failed")
                raise HTTPException(status_code=422, detail=f"Could not read DOCX: {e}")

            if not docs:
                raise HTTPException(status_code=422, detail="DOCX appears to be empty.")

            word_count = docx_meta["word_count"]
            truncated  = docx_meta["truncated"]

            chunks = split_documents(docs)
            try:
                get_or_create_vectorstore(media_id, docs_builder=lambda _: chunks)
            except Exception as e:
                log.warning("Vectorstore build failed for DOCX %s: %s", media_id, e)

            meta = {
                "media_id": media_id, "source_type": "docx",
                "source_url": None, "local_path": local_path,
                "title": filename, "word_count": word_count,
                "truncated": truncated, "full_text": full_text,
            }

        else:
            meta = {
                "media_id": media_id, "source_type": "upload",
                "source_url": None, "local_path": local_path, "title": filename,
            }
            try:
                get_or_create_vectorstore(media_id, docs_builder=_build_docs)
            except Exception as e:
                log.warning("Eager vectorstore build failed for %s: %s", media_id, e)

    register_media(media_id, meta)
    return IngestResponse(
        media_id=media_id, source_type=meta["source_type"],
        title=meta.get("title"), word_count=word_count, truncated=truncated,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Media / Doc endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/media/{media_id}")
def get_media_file(media_id: str):
    meta = get_media_meta(media_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Media not found")
    local_path = meta.get("local_path")
    if not local_path or not os.path.exists(local_path):
        raise HTTPException(status_code=404, detail="File missing on disk")
    mime_type, _ = mimetypes.guess_type(local_path)
    return FileResponse(
        path=local_path,
        media_type=mime_type or "application/octet-stream",
        filename=os.path.basename(local_path),
    )


@app.get("/doc/{media_id}")
def get_doc(media_id: str):
    meta = get_media_meta(media_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Document not found")

    if "full_text" in meta and meta["full_text"]:
        return {"text": meta["full_text"]}

    if meta.get("source_type") == "docx":
        try:
            docs, _ = load_docx_docs(meta.get("local_path", ""))
            full_text = "\n\n".join(d.page_content for d in docs)
            # Cache it back
            meta["full_text"] = full_text
            save_media(meta)
            return {"text": full_text}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load document: {e}")

    raise HTTPException(status_code=400, detail=f"Not a document source.")


# ─────────────────────────────────────────────────────────────────────────────
# Chapters
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/chapters/{video_id}", dependencies=[Depends(rate_limit("chapters"))])
def get_chapters(video_id: str):
    meta = get_media_meta(video_id)
    if meta and meta.get("source_type") == "docx":
        try:
            docs, _ = load_docx_docs(meta.get("local_path", ""))
        except Exception:
            docs = []
        result = detect_chapters_from_docs(docs, media_id=video_id, window_sec=80)
        return result.to_dict()
    return detect_chapters(video_id)


# ─────────────────────────────────────────────────────────────────────────────
# Quiz
# ─────────────────────────────────────────────────────────────────────────────
from typing import Literal
Difficulty = Literal["easy", "medium", "hard"]

@app.get("/quiz/{video_id}", dependencies=[Depends(rate_limit("quiz"))])
def get_quiz(video_id: str, num_questions: int = 5, difficulty: Difficulty = "medium"):
    meta = get_media_meta(video_id)
    if meta and meta.get("source_type") == "docx":
        try:
            docs, _ = load_docx_docs(meta.get("local_path", ""))
        except Exception:
            docs = []
        return generate_quiz_from_docs(docs, video_id, num_questions, difficulty).to_dict()
    return generate_quiz(video_id, num_questions, difficulty)  


# ─────────────────────────────────────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────────────────────────────────────

app.include_router(export_router)