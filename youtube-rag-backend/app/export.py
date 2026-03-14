from fastapi import APIRouter
from fastapi.responses import FileResponse
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, ListFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
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
- Focus on concepts
- Do not include transcript
"""
    )["answer"]

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "TitleStyle",
        parent=styles["Title"],
        alignment=1,
        fontSize=24,
        textColor=HexColor("#111827")
    )

    heading_style = ParagraphStyle(
        "HeadingStyle",
        parent=styles["Heading2"],
        textColor=HexColor("#1f2937"),
        spaceAfter=10
    )

    bullet_style = ParagraphStyle(
        "BulletStyle",
        parent=styles["BodyText"],
        fontSize=11,
        leftIndent=5
    )

    doc = SimpleDocTemplate(
        str(filename),
        pagesize=A4,
        rightMargin=40,
        leftMargin=40,
        topMargin=50,
        bottomMargin=40
    )

    elements = []

    elements.append(Paragraph(video_title, title_style))
    elements.append(Spacer(1, 6))

    elements.append(
        Paragraph(f"<font size=11><i>{channel_name}</i></font>", styles["Normal"])
    )

    elements.append(Spacer(1, 20))

    section = None
    bullets = []

    for line in notes.split("\n"):

        line = line.strip()

        if not line:
            continue

        if line.endswith(":"):
            if bullets:
                elements.append(ListFlowable(bullets, bulletType="bullet"))
                elements.append(Spacer(1, 12))
                bullets = []

            elements.append(Paragraph(line, heading_style))

        else:
            bullets.append(Paragraph(line.replace("•", ""), bullet_style))

    if bullets:
        elements.append(ListFlowable(bullets, bulletType="bullet"))

    doc.build(elements)

    return FileResponse(
        filename,
        media_type="application/pdf",
        filename=f"{video_title}.pdf"
    )