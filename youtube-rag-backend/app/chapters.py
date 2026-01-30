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

def detect_chapters(video_id: str):
    """Auto-detect chapters from transcript"""
    print(f"[detect_chapters] Starting for {video_id}")
    
    # Load transcript
    docs = load_youtube_docs(video_id)
    if not docs:
        return {"error": "No transcript available"}
    
    # Combine into full text with timestamps
    full_text = ""
    for doc in docs[:100]:  # First ~10 minutes to avoid token limits
        ts = doc.metadata.get("start", 0)
        mm, ss = divmod(ts, 60)
        full_text += f"[{mm:02d}:{ss:02d}] {doc.page_content}\n"
    
    # Prompt for chapter detection
    prompt = PromptTemplate.from_template("""
Analyze this video transcript and identify distinct chapters/topics.

Return a JSON array with this EXACT structure:
[
  {{"title": "Introduction", "start_time": 0, "timestamp": "00:00"}},
  {{"title": "Main Topic", "start_time": 120, "timestamp": "02:00"}}
]

Rules:
- Identify 3-7 major topic shifts
- Each chapter should be at least 1 minute long
- Title should be concise (2-5 words)
- Return ONLY valid JSON, no other text

Transcript:
{transcript}

JSON:""")
    
    chain = prompt | llm | JsonOutputParser()
    
    try:
        chapters = chain.invoke({"transcript": full_text})
        print(f"[detect_chapters] Found {len(chapters)} chapters")
        return {"chapters": chapters, "video_id": video_id}
    except Exception as e:
        print(f"[detect_chapters] Error: {e}")
        # Fallback: simple time-based chapters
        return {
            "chapters": [
                {"title": f"Part {i+1}", "start_time": i*300, "timestamp": f"{(i*5):02d}:00"}
                for i in range(3)
            ],
            "video_id": video_id
        }