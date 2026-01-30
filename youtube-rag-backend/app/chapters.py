from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from app.rag import load_youtube_docs, split_documents
import json

llm = ChatGroq(
    model="llama-3.1-8b-instant",
    temperature=0,
    max_tokens=2000
)

def format_ts(seconds: int) -> str:
    m, s = divmod(seconds, 60)
    return f"{m:02d}:{s:02d}"


def detect_chapters(video_id: str):
    docs = load_youtube_docs(video_id)
    if not docs:
        return {"error": "No transcript available"}

    full_text = ""
    MAX_SECONDS = 600  # 10 minutes

    for doc in docs:
        ts = int(doc.metadata.get("start", 0))
        if ts > MAX_SECONDS:
            break
        full_text += f"[{format_ts(ts)}] {doc.page_content}\n"

    prompt = PromptTemplate.from_template("""
Analyze this video transcript and identify distinct chapters.

Return ONLY valid JSON in this format:
[
  {{"title": "Introduction", "start_time": 0}},
  {{"title": "Main Topic", "start_time": 120}}
]

Rules:
- 3–7 chapters
- start_time MUST be in seconds
- No timestamp strings
- No extra text

Transcript:
{transcript}

JSON:
""")

    chain = prompt | llm | JsonOutputParser()

    try:
        chapters = chain.invoke({"transcript": full_text})

        # enforce correct timestamps
        for ch in chapters:
            ch["start_time"] = int(ch["start_time"])
            ch["timestamp"] = format_ts(ch["start_time"])

        return {"chapters": chapters, "video_id": video_id}

    except Exception as e:
        return {
            "chapters": [
                {
                    "title": f"Part {i+1}",
                    "start_time": i * 300,
                    "timestamp": format_ts(i * 300),
                }
                for i in range(3)
            ],
            "video_id": video_id,
        }
