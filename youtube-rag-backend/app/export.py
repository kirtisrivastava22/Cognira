from fastapi import APIRouter
from fastapi.responses import FileResponse
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import A4
from pathlib import Path
from app.rag import ask_youtube_video, load_youtube_docs, split_documents
import requests


router = APIRouter()


def get_video_metadata(video_id: str):

    url = "https://www.youtube.com/oembed"
    params = {
        "url": f"https://www.youtube.com/watch?v={video_id}",
        "format": "json"
    }

    try:
        res = requests.get(url, params=params, timeout=5)
        res.raise_for_status()
        data = res.json()

        return {
            "title": data.get("title", f"YouTube Video ({video_id})"),
            "channel": data.get("author_name", "Unknown Channel")
        }

    except:
        return {
            "title": f"YouTube Video ({video_id})",
            "channel": "Unknown Channel"
        }


@router.post("/export/pdf")
def export_pdf(video_id: str):

    EXPORT_DIR = Path("exports")
    EXPORT_DIR.mkdir(exist_ok=True)
    filename = EXPORT_DIR / f"{video_id}_notes.pdf"

    docs = split_documents(load_youtube_docs(video_id))
    if not docs:
        return {"error": "Transcript not available"}

    meta = get_video_metadata(video_id)
    video_title = meta["title"]
    channel_name = meta["channel"]

    notes = ask_youtube_video(
        video_id,
        """
Create structured STUDY NOTES from this video.

RULES:
- Use bullet points
- Use topic headings
- Focus on concepts, definitions, processes
- No storytelling
- No summary paragraph
- Write like class notes

FORMAT:

Overview:
• point
• point

Key Concepts:
• concept — explanation
• concept — explanation

Important Details:
• detail
• detail
"""
    )["answer"]

    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(filename), pagesize=A4)
    elements = []

    elements.append(Paragraph(video_title, styles["Title"]))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(f"<i>{channel_name}</i>", styles["Heading3"]))
    elements.append(Spacer(1, 12))

    for line in notes.split("\n"):
        elements.append(Paragraph(line, styles["BodyText"]))
        elements.append(Spacer(1, 4))

    doc.build(elements)

    return FileResponse(
        filename,
        media_type="application/pdf",
        filename=f"{video_title}.pdf"
    )
