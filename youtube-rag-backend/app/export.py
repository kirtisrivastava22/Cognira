"""
export.py
---------
Generates a professionally designed DOCX study-notes document from a
YouTube video transcript.

Architecture:
  Python (FastAPI) ─► gathers content via RAG ─► writes a JSON payload
  ─► spawns a Node.js script that builds the .docx with the `docx` npm library
  ─► returns the file to the client.

Why Node for the docx?  The `python-docx` library cannot produce the
design-quality output we need (accent bars, shaded table cells, coloured
numbered rows, proper footers with page numbers).  The `docx` npm package
handles all of that reliably.
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pathlib import Path
import subprocess
import tempfile
import json
import os
import re
import requests
from datetime import datetime

from app.rag import (
    ask_youtube_video,
    load_youtube_docs,
    split_documents,
    hybrid_retrieve,
    rerank_docs_by_timestamp_density,
    get_or_create_vectorstore,
    format_docs_with_timestamps,
)

router = APIRouter()

# Path to the Node.js generator script (lives next to this file in app/)
_GENERATOR_SCRIPT = Path(__file__).parent / "docx_generator.js"


# ──────────────────────────────────────────────────────────────────────────
# Video metadata
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
            "title": data.get("title", f"YouTube Video ({video_id})"),
            "channel": data.get("author_name", "Unknown Channel"),
        }
    except Exception:
        return {"title": f"YouTube Video ({video_id})", "channel": "Unknown Channel"}


# ──────────────────────────────────────────────────────────────────────────
# Content generation helpers
# ──────────────────────────────────────────────────────────────────────────

_NOTE_QUESTIONS = [
    ("Key Concepts",
     "List the 3-5 most important concepts or definitions introduced in this video. "
     "Use bullet points. Each bullet: one clear sentence. No timestamps."),

    ("Main Points & Explanations",
     "What are the main points or arguments made in this video? "
     "List them as concise bullet points (one idea per bullet)."),

    ("Examples & Case Studies",
     "What specific examples, analogies, or case studies does the speaker use? "
     "List each as a short bullet. If none, reply: None mentioned."),

    ("Comparisons & Trade-offs",
     "Does the video compare two or more approaches, tools, or ideas? "
     "List the key differences as bullet points. If none, reply: None mentioned."),

    ("Conclusions & Recommendations",
     "What conclusions or recommendations does the speaker give? "
     "List as bullet points."),
]

_SUMMARY_QUESTION = (
    "Write a 2-3 sentence executive summary of this video. "
    "What is it about, and what is the main insight a viewer should take away?"
)

_TAKEAWAY_QUESTION = (
    "List exactly 3 key takeaways from this video — the 3 things a student must "
    "remember after watching. Each takeaway: one sentence, no timestamps."
)


def _ask(video_id: str, question: str) -> str:
    """Ask a question and return just the answer text, stripping timestamps."""
    result = ask_youtube_video(video_id, question)
    answer = result.get("answer", "")
    # Strip inline timestamp citations like [04:55] for prose sections
    answer = re.sub(r'\[\d{2}:\d{2}\]', '', answer).strip()
    return answer if answer and "i don't know" not in answer.lower() else ""


def _parse_bullets(text: str) -> list[str]:
    """Turn a freeform LLM bullet response into a clean list of strings."""
    if not text:
        return []
    bullets = []
    for line in text.splitlines():
        line = re.sub(r'^[\s\-\*•\d\.]+', '', line).strip()
        if len(line) > 8:
            bullets.append(line)
    return bullets[:8]  # cap at 8 bullets per section


def _get_top_timestamps(video_id: str, n: int = 6) -> list[dict]:
    """Pull the most information-dense timestamps from the cached vectorstore."""
    db = get_or_create_vectorstore(
        video_id,
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
        # Use the first ~60 chars of the chunk as a topic label
        label = doc.page_content[:60].strip().rstrip(",.")
        timestamps.append({"seconds": ts, "display": f"{mm:02d}:{ss:02d}", "label": label})
        if len(timestamps) >= n:
            break

    return timestamps


# ──────────────────────────────────────────────────────────────────────────
# PDF export (legacy, kept for backwards compatibility)
# ──────────────────────────────────────────────────────────────────────────

# @router.post("/export/pdf")
# def export_pdf(video_id: str):
#     """
#     Kept for backwards compatibility.  Redirects to the DOCX export.
#     """
#     return export_docx(video_id)


# ──────────────────────────────────────────────────────────────────────────
# DOCX export (new, primary)
# ──────────────────────────────────────────────────────────────────────────

@router.post("/export/docx")
def export_docx(video_id: str):
    """
    Generate a professionally designed DOCX study-notes document.

    Flow:
      1.  Fetch video metadata (title, channel).
      2.  Run focused RAG queries to extract summary, sections, takeaways.
      3.  Pull representative timestamps.
      4.  Serialise everything to JSON and pass to the Node.js docx generator.
      5.  Return the .docx file.
    """
    # ── 1. Metadata ───────────────────────────────────────────────────────
    meta = get_video_metadata(video_id)

    # ── 2. Content via RAG ────────────────────────────────────────────────
    summary_raw = _ask(video_id, _SUMMARY_QUESTION)
    summary = summary_raw or "Summary not available."

    sections = []
    for heading, question in _NOTE_QUESTIONS:
        raw = _ask(video_id, question)
        bullets = _parse_bullets(raw)
        if bullets and bullets != ["None mentioned"]:
            sections.append({"heading": heading, "bullets": bullets})

    takeaways_raw = _ask(video_id, _TAKEAWAY_QUESTION)
    takeaways = _parse_bullets(takeaways_raw) or ["See the video for key insights."]

    # ── 3. Timestamps ─────────────────────────────────────────────────────
    timestamps = _get_top_timestamps(video_id, n=6)

    # ── 4. Build payload ──────────────────────────────────────────────────
    payload = {
        "video_title": meta["title"],
        "channel_name": meta["channel"],
        "video_url": f"https://www.youtube.com/watch?v={video_id}",
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "summary": summary,
        "sections": sections,
        "key_takeaways": takeaways[:4],
        "timestamps": timestamps,
    }

    # ── 5. Generate DOCX via Node.js ─────────────────────────────────────
    export_dir = Path("exports")
    export_dir.mkdir(exist_ok=True)
    out_path = export_dir / f"{video_id}_notes.docx"

    # Write payload to a temp file so Node can read it
    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False, encoding="utf-8"
    ) as tmp:
        json.dump(payload, tmp, ensure_ascii=False)
        tmp_path = tmp.name

    try:
        result = subprocess.run(
            ["node", str(_GENERATOR_SCRIPT), tmp_path, str(out_path)],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            # print("STDOUT:", result.stdout)
            # print("STDERR:", result.stderr)
            raise RuntimeError(result.stderr or result.stdout)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Document generation timed out.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DOCX generation failed: {exc}")
    finally:
        os.unlink(tmp_path)

    if not out_path.exists():
        raise HTTPException(status_code=500, detail="DOCX file was not created.")

    safe_title = re.sub(r'[^\w\s-]', '', meta["title"])[:60].strip()
    filename = f"{safe_title} — Study Notes.docx" if safe_title else "Study Notes.docx"

    return FileResponse(
        str(out_path),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=filename,
    )