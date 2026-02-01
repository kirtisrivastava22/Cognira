# app/export.py
from fastapi import APIRouter
from fastapi.responses import FileResponse
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import A4
import os

from app.rag import ask_youtube_video
from app.vectorstore import get_or_create_vectorstore
from app.rag import split_documents
from app.rag import load_youtube_docs
from pathlib import Path

router = APIRouter()

@router.post("/export/pdf")
def export_pdf(video_id: str):
    EXPORT_DIR = Path("exports")
    EXPORT_DIR.mkdir(exist_ok=True)
    filename = EXPORT_DIR / f"{video_id}_notes.pdf"


    # -------- Load transcript --------
    docs = split_documents(load_youtube_docs(video_id))

    if not docs:
        return {"error": "Transcript not available"}

    # -------- Generate short notes --------
    summary = ask_youtube_video(
    video_id,
    """
Create concise topic-based notes for this YouTube video.

RULES:
- Do NOT include timestamps
- Do NOT quote transcript sentences
- Do NOT mention the speaker
- Use clear topic headings
- Under each topic, explain briefly what is discussed
- Keep it short, clean, and high-level

FORMAT STRICTLY LIKE THIS:

Overview:
<2–3 sentence overview of the video>

Topics Covered:
- Topic 1: short explanation
- Topic 2: short explanation
- Topic 3: short explanation
"""
)["answer"]



    # -------- Build PDF --------
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(filename), pagesize=A4)
    elements = []

    elements.append(
    Paragraph(
        f"<b>Notes for YouTube Video ({video_id})</b>",
        styles["Title"]
    )
)
    elements.append(Spacer(1, 12))
    elements.append(Paragraph(summary, styles["BodyText"]))
    elements.append(Spacer(1, 12))

    doc.build(elements)

    return FileResponse(
        filename,
        media_type="application/pdf",
        filename=f"{video_id}_notes.pdf"
    )
