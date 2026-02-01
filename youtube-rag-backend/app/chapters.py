from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser

from app.rag import load_youtube_docs

# =========================
# LLM (titles ONLY)
# =========================

llm = ChatGroq(
    model="llama-3.1-8b-instant",
    temperature=0,
    max_tokens=500
)


def format_ts(seconds: int) -> str:
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"


# =========================
# MANUAL CHAPTER BUCKETING
# =========================

def bucket_transcript(docs, window_sec=300, max_chapters=6):
    """
    Buckets transcript by time.
    This is the ONLY source of timestamps.
    """
    docs = sorted(docs, key=lambda d: d.metadata["start"])

    buckets = []
    current = []
    start_ts = docs[0].metadata["start"]

    for doc in docs:
        ts = doc.metadata["start"]

        if ts - start_ts <= window_sec:
            current.append(doc.page_content)
        else:
            buckets.append({
                "start_time": start_ts,
                "text": " ".join(current)
            })
            if len(buckets) >= max_chapters:
                return buckets

            start_ts = ts
            current = [doc.page_content]

    if current and len(buckets) < max_chapters:
        buckets.append({
            "start_time": start_ts,
            "text": " ".join(current)
        })

    return buckets


# =========================
# CHAPTER DETECTION (SAFE)
# =========================

def detect_chapters(video_id: str):
    docs = load_youtube_docs(video_id)
    if not docs:
        return {"error": "No transcript available"}

    # 1️⃣ Manual timestamp buckets (SOURCE OF TRUTH)
    buckets = bucket_transcript(docs)

    # 2️⃣ LLM ONLY for titles
    prompt = PromptTemplate.from_template("""
You are given a section of a YouTube transcript.

Return ONLY valid JSON:
{{
  "title": "Short descriptive chapter title"
}}

Rules:
- 3 to 6 words
- No timestamps
- No punctuation
- No extra text

Transcript:
{text}

JSON:
""")

    chapters = []

    for idx, bucket in enumerate(buckets):
        try:
            chain = prompt | llm | JsonOutputParser()
            result = chain.invoke({"text": bucket["text"]})

            title = result.get("title", f"Part {idx + 1}")

        except Exception:
            title = f"Part {idx + 1}"

        ts = int(bucket["start_time"])

        chapters.append({
            "title": title,
            "start_time": ts,
            "timestamp": format_ts(ts)
        })

    return {
        "video_id": video_id,
        "chapters": chapters
    }
