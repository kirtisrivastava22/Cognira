"""
Generates a professionally designed DOCX study-notes document.

Supports:
  • YouTube videos  — RAG over YouTube transcript
  • Uploaded DOCX   — RAG over parsed document text (no transcript needed)
  • Audio / video   — RAG over Whisper transcript

Rate-limited via Depends(rate_limit("export")).
"""

from __future__ import annotations

import json
import logging
import os
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path

import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.rate_limiter import rate_limit
from app.rag import (
    ask_youtube_video,
    load_youtube_docs,
    split_documents,
    hybrid_retrieve,
    rerank_docs_by_timestamp_density,
    get_or_create_vectorstore,
    format_docs_with_references,
)
from app.media_manager import get_media_meta
from app.docx_reader import load_docx_docs

log = logging.getLogger("export")

router = APIRouter()

_GENERATOR_SCRIPT = Path(__file__).parent / "docx_generator.js"


# ──────────────────────────────────────────────────────────────────────────
# Metadata helpers
# ──────────────────────────────────────────────────────────────────────────

def get_video_metadata(video_id: str) -> dict:
    try:
        res = requests.get(
            "https://www.youtube.com/oembed",
            params={"url": f"https://www.youtube.com/watch?v={video_id}", "format": "json"},
            timeout=5,
        )
        res.raise_for_status()
        data = res.json()
        return {
            "title":   data.get("title", f"YouTube Video ({video_id})"),
            "channel": data.get("author_name", "Unknown Channel"),
        }
    except Exception:
        return {"title": f"YouTube Video ({video_id})", "channel": "Unknown Channel"}


def _media_metadata(media_id: str) -> dict:
    """Return title / channel for any media type."""
    meta = get_media_meta(media_id)
    if meta:
        title = meta.get("title") or media_id
        source_type = meta.get("source_type", "")
        if source_type == "youtube":
            return get_video_metadata(media_id)
        return {"title": title, "channel": source_type.capitalize() + " upload"}
    # Fallback — try YouTube
    return get_video_metadata(media_id)


# ──────────────────────────────────────────────────────────────────────────
# Content generation
# ──────────────────────────────────────────────────────────────────────────

_NOTE_QUESTIONS = [
    ("Key Concepts",
     "List the 3-5 most important concepts or definitions introduced in this content. "
     "Use bullet points. Each bullet: one clear sentence. No timestamps."),
    ("Main Points & Explanations",
     "What are the main points or arguments made in this content? "
     "List them as concise bullet points (one idea per bullet)."),
    ("Examples & Case Studies",
     "What specific examples, analogies, or case studies does the author use? "
     "List each as a short bullet. If none, reply: None mentioned."),
    ("Comparisons & Trade-offs",
     "Does the content compare two or more approaches, tools, or ideas? "
     "List the key differences as bullet points. If none, reply: None mentioned."),
    ("Conclusions & Recommendations",
     "What conclusions or recommendations are given? List as bullet points."),
]

_SUMMARY_Q  = (
    "Write a 2-3 sentence executive summary. "
    "What is it about, and what is the main insight a reader should take away?"
)
_TAKEAWAY_Q = (
    "List exactly 3 key takeaways — the 3 things a student must remember. "
    "Each: one sentence, no timestamps."
)


def _ask(media_id: str, question: str) -> str:
    result = ask_youtube_video(media_id, question)
    answer = result.get("answer", "")
    answer = re.sub(r'\[\d{2}:\d{2}\]', '', answer).strip()
    return answer if answer and "i don't know" not in answer.lower() else ""


def _parse_bullets(text: str) -> list[str]:
    if not text:
        return []
    bullets = []
    for line in text.splitlines():
        line = re.sub(r'^[\s\-\*•\d\.]+', '', line).strip()
        if len(line) > 8:
            bullets.append(line)
    return bullets[:8]


def _get_top_timestamps(media_id: str, n: int = 6) -> list[dict]:
    """Pull top timestamps — returns empty list for DOCX (no time axis)."""
    meta = get_media_meta(media_id)
    if meta and meta.get("source_type") == "docx":
        return []

    from app.rag import get_or_create_vectorstore, hybrid_retrieve, rerank_docs_by_timestamp_density
    db = get_or_create_vectorstore(
        media_id,
        docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
    )
    if db is None:
        return []

    docs = hybrid_retrieve(db, "key concepts main points", k=20)
    docs = rerank_docs_by_timestamp_density(docs)

    timestamps = []
    seen = set()
    for doc in docs:
        ts = int(doc.metadata.get("start", 0))
        if any(abs(ts - s) < 45 for s in seen):
            continue
        seen.add(ts)
        mm, ss = divmod(ts, 60)
        label = doc.page_content[:60].strip().rstrip(",.")
        timestamps.append({"seconds": ts, "display": f"{mm:02d}:{ss:02d}", "label": label})
        if len(timestamps) >= n:
            break

    return timestamps


# ──────────────────────────────────────────────────────────────────────────
# DOCX export endpoint
# ──────────────────────────────────────────────────────────────────────────

@router.post("/export/docx", dependencies=[Depends(rate_limit("export"))])
def export_docx(video_id: str):
    """
    Generate a study-notes DOCX for any ingested media (YouTube, upload, DOCX).
    """
    # ── Metadata ──────────────────────────────────────────────────────────────
    meta_info = _media_metadata(video_id)
    source_url = f"https://www.youtube.com/watch?v={video_id}"
    media_meta = get_media_meta(video_id)
    if media_meta and media_meta.get("source_type") != "youtube":
        source_url = media_meta.get("source_url") or media_meta.get("title") or video_id

    # ── Content ───────────────────────────────────────────────────────────────
    summary  = _ask(video_id, _SUMMARY_Q) or "Summary not available."

    sections = []
    for heading, question in _NOTE_QUESTIONS:
        raw     = _ask(video_id, question)
        bullets = _parse_bullets(raw)
        if bullets and bullets != ["None mentioned"]:
            sections.append({"heading": heading, "bullets": bullets})

    takeaways = _parse_bullets(_ask(video_id, _TAKEAWAY_Q)) or ["See the content for key insights."]
    timestamps = _get_top_timestamps(video_id, n=6)

    # ── Payload ───────────────────────────────────────────────────────────────
    payload = {
        "video_title":  meta_info["title"],
        "channel_name": meta_info["channel"],
        "video_url":    source_url,
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "summary":      summary,
        "sections":     sections,
        "key_takeaways": takeaways[:4],
        "timestamps":   timestamps,
    }

    # ── Node.js generator ─────────────────────────────────────────────────────
    export_dir = Path("exports")
    export_dir.mkdir(exist_ok=True)
    out_path = export_dir / f"{video_id}_notes.docx"

    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False, encoding="utf-8") as tmp:
        json.dump(payload, tmp, ensure_ascii=False)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["node", str(_GENERATOR_SCRIPT), tmp_path, str(out_path)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr or result.stdout)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Document generation timed out.")
    except Exception as exc:
        log.exception("DOCX generation failed")
        raise HTTPException(status_code=500, detail=f"DOCX generation failed: {exc}")
    finally:
        os.unlink(tmp_path)

    if not out_path.exists():
        raise HTTPException(status_code=500, detail="DOCX file was not created.")

    safe_title = re.sub(r'[^\w\s-]', '', meta_info["title"])[:60].strip()
    filename   = f"{safe_title} — Study Notes.docx" if safe_title else "Study Notes.docx"

    return FileResponse(
        str(out_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )