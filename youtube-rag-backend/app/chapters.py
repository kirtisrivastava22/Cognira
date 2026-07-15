from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Optional

from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.documents import Document

from app.rag import load_youtube_docs
import os

def _get_llm():
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return None
    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=0,
        max_tokens=300,
    )


@dataclass
class Chapter:
    title:       str
    start_time:  int          
    timestamp:   str            
    ref_type:    str = "video" 
    summary:     str = ""       
    key_topics:  list[str] = field(default_factory=list)   

@dataclass
class ChapterResult:
    media_id:  str
    chapters:  list[Chapter] = field(default_factory=list)
    error:     str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# Helpers

def _fmt(seconds: int) -> str:
    seconds = max(0, int(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def _is_docx_docs(docs: list[Document]) -> bool:
    return bool(docs) and docs[0].metadata.get("source") == "docx"


def _clean_json(raw: str) -> str:
    return re.sub(r"```(?:json)?", "", raw).strip()

# Bucketing: semantic-aware windowing

_TOPIC_SHIFT_WORDS = {
    "now let", "next", "moving on", "let's talk", "let's discuss",
    "another", "second", "third", "finally", "in contrast", "on the other hand",
    "let me show", "let me explain", "so what", "so how", "the problem",
    "the solution", "the key", "the first", "the second", "the third",
}

def _has_topic_shift(text: str) -> bool:
    lower = text.lower()
    return any(sig in lower for sig in _TOPIC_SHIFT_WORDS)


def bucket_transcript(
    docs:        list[Document],
    window_sec:  int = 240,
    max_chapters: int = 7,
    min_words:   int = 40,
) -> list[dict]:
    if not docs:
        return []

    docs = sorted(docs, key=lambda d: d.metadata.get("start", 0))

    buckets: list[dict] = []
    current_texts: list[str] = []
    current_start = docs[0].metadata.get("start", 0)
    last_split_ts = current_start

    for doc in docs:
        ts   = doc.metadata.get("start", 0)
        text = doc.page_content

        time_since_split = ts - last_split_ts
        trigger_time     = time_since_split >= window_sec
        trigger_semantic = time_since_split >= 60 and _has_topic_shift(text)

        if (trigger_time or trigger_semantic) and current_texts:
            buckets.append({
                "start_time": current_start,
                "timestamp":  _fmt(current_start),
                "text":       " ".join(current_texts),
            })
            if len(buckets) >= max_chapters:
                # Drain remaining docs into last bucket
                remaining = docs[docs.index(doc):]
                buckets[-1]["text"] += " " + " ".join(d.page_content for d in remaining)
                return _merge_short_buckets(buckets, min_words)

            current_texts = []
            current_start = ts
            last_split_ts = ts

        current_texts.append(text)

    # Flush last bucket
    if current_texts:
        buckets.append({
            "start_time": current_start,
            "timestamp":  _fmt(current_start),
            "text":       " ".join(current_texts),
        })

    return _merge_short_buckets(buckets, min_words)


def bucket_paragraphs(
    docs:            list[Document],
    paragraphs_per_chapter: int = 6,
    max_chapters:    int = 7,
    min_words:       int = 40,
) -> list[dict]:
    if not docs:
        return []

    docs = sorted(docs, key=lambda d: d.metadata.get("paragraph", 0))

    buckets: list[dict] = []
    current_texts: list[str] = []
    current_start_para = docs[0].metadata.get("paragraph", 0)
    paras_since_split = 0
    last_para_seen = current_start_para

    for doc in docs:
        para = doc.metadata.get("paragraph", last_para_seen)
        text = doc.page_content

        paras_since_split = para - current_start_para
        trigger_count    = paras_since_split >= paragraphs_per_chapter
        trigger_semantic = paras_since_split >= 2 and _has_topic_shift(text)

        if (trigger_count or trigger_semantic) and current_texts:
            buckets.append({
                "start_time": current_start_para,
                "timestamp":  f"Para {current_start_para}",
                "text":       " ".join(current_texts),
            })
            if len(buckets) >= max_chapters:
                remaining = docs[docs.index(doc):]
                buckets[-1]["text"] += " " + " ".join(d.page_content for d in remaining)
                return _merge_short_buckets(buckets, min_words)

            current_texts = []
            current_start_para = para
            last_para_seen = para

        current_texts.append(text)
        last_para_seen = para

    if current_texts:
        buckets.append({
            "start_time": current_start_para,
            "timestamp":  f"Para {current_start_para}",
            "text":       " ".join(current_texts),
        })

    return _merge_short_buckets(buckets, min_words)


def _merge_short_buckets(buckets: list[dict], min_words: int) -> list[dict]:
    merged = []
    for b in buckets:
        word_count = len(b["text"].split())
        if merged and word_count < min_words:
            merged[-1]["text"] += " " + b["text"]
        else:
            merged.append(b)
    return merged


_CHAPTER_PROMPT = PromptTemplate.from_template(
"""You are analysing a section of a video/audio transcript.

Return ONLY valid JSON — no markdown, no extra text:
{{
  "title":      "Short chapter title (3–6 words, no punctuation)",
  "summary":    "One sentence describing what this section covers.",
  "key_topics": ["topic1", "topic2", "topic3"]
}}

Rules for title:
- 3 to 6 words
- No timestamps, no punctuation, no quotation marks
- Describe the CONTENT, not the format (no "Introduction to video")

Rules for key_topics:
- 2 to 3 short keyword phrases (2–3 words each)
- Represent the main technical or conceptual themes

Transcript section:
{text}

JSON:"""
)


def _llm_title_for_bucket(bucket: dict, idx: int, ref_type: str = "video") -> Chapter:
   
    try:
        llm = _get_llm()
        if llm is None:
            raise RuntimeError("No LLM configured")

        chain  = _CHAPTER_PROMPT | llm | JsonOutputParser()
        result = chain.invoke({"text": bucket["text"][:1000]})

        title      = result.get("title", f"Part {idx + 1}")
        summary    = result.get("summary", "")
        key_topics = result.get("key_topics", [])

        # Sanitise
        if not isinstance(title, str) or len(title.strip()) < 2:
            title = f"Part {idx + 1}"
        if not isinstance(summary, str):
            summary = ""
        if not isinstance(key_topics, list):
            key_topics = []
        key_topics = [t for t in key_topics if isinstance(t, str)][:3]

    except Exception as exc:
        print(f"[chapters._llm_title_for_bucket] bucket {idx}: {exc}")
        title      = f"Part {idx + 1}"
        summary    = ""
        key_topics = []

    return Chapter(
        title      = title,
        start_time = int(bucket["start_time"]),
        timestamp  = bucket["timestamp"],
        ref_type   = ref_type,
        summary    = summary,
        key_topics = key_topics,
    )

# Public API

def detect_chapters_from_docs(
    docs:         list[Document],
    media_id:     str,
    window_sec:   int = 240,
    max_chapters: int = 7,
) -> ChapterResult:
    
    result = ChapterResult(media_id=media_id)

    if not docs:
        result.error = "No transcript available."
        return result

    is_docx = _is_docx_docs(docs)

    if is_docx:
        buckets = bucket_paragraphs(docs, max_chapters=max_chapters)
    else:
        buckets = bucket_transcript(docs, window_sec=window_sec, max_chapters=max_chapters)

    if not buckets:
        result.error = "Could not segment the transcript into chapters."
        return result

    ref_type = "docx" if is_docx else "video"
    chapters = [_llm_title_for_bucket(b, i, ref_type=ref_type) for i, b in enumerate(buckets)]
    result.chapters = chapters
    return result


def detect_chapters(video_id: str) -> dict:
    docs   = load_youtube_docs(video_id)
    result = detect_chapters_from_docs(docs, media_id=video_id)
    return result.to_dict()
