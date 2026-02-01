from fastapi import APIRouter
from fastapi.responses import FileResponse
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.pagesizes import A4
from pathlib import Path
from app.rag import ask_youtube_video, load_youtube_docs, split_documents
import requests

def get_video_metadata(video_id: str):
    """
    Fetches video title and channel name using YouTube oEmbed.
    No API key required.
    """
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

    except Exception:
        return {
            "title": f"YouTube Video ({video_id})",
            "channel": "Unknown Channel"
        }


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

    # -------- Fetch YouTube metadata --------
    meta = get_video_metadata(video_id)
    video_title = meta["title"]
    channel_name = meta["channel"]

    # -------- Generate structured notes --------
    summary = ask_youtube_video(
        video_id,
        """
Create concise topic-based notes for this YouTube video only based on context.

RULES:
- Do NOT tell that a video is made here or how video is made
- Tell what is discussed in the video only
- Use bullet points for topics
- Do NOT include timestamps
- Do NOT quote transcript sentences
- Do NOT mention the speaker
- Use clear topic headings
- Under each topic, explain briefly what is discussed
- Keep it short, clean, and high-level

FORMAT STRICTLY LIKE THIS:

Overview:
<2–3 sentence overview>

Topics Covered:
- Topic 1: short explanation (nextline)
- Topic 2: short explanation (nextline)
- Topic 3: short explanation
"""
    )["answer"]

    # -------- Build PDF --------
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(str(filename), pagesize=A4)
    elements = []

    elements.append(Paragraph(video_title, styles["Title"]))
    elements.append(Spacer(1, 6))

    elements.append(
        Paragraph(f"<i>{channel_name}</i>", styles["Heading3"])
    )
    elements.append(Spacer(1, 12))

    elements.append(Paragraph(summary, styles["BodyText"]))
    elements.append(Spacer(1, 12))

    doc.build(elements)

    return FileResponse(
        filename,
        media_type="application/pdf",
        filename=f"{video_title}.pdf"
    )
