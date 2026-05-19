"""
Detects logical chapters from any transcript (YouTube, audio upload, etc.)

Design goals:
  - Source-agnostic: operates on any list of LangChain Documents
  - Semantic bucketing: splits on natural topic-shift signals, not just clock time
  - Richer output: each chapter carries summary + key topics (ready for UI cards)
  - Resilient: LLM failure on a single bucket never kills the whole result
  - Extensible: ChapterResult dataclass easy to add new fields later
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field, asdict
from typing import Optional

from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from langchain_core.documents import Document

from app.rag import load_youtube_docs


# ─────────────────────────────────────────────────────────────────────────────
# LLM (fast, cheap — chapter titles don't need 70b)
# ─────────────────────────────────────────────────────────────────────────────

_llm = ChatGroq(
    model="llama-3.1-8b-instant",
    temperature=0,
    max_tokens=300,
)


# ─────────────────────────────────────────────────────────────────────────────
# Types
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Chapter:
    title:       str
    start_time:  int            # seconds
    timestamp:   str            # "mm:ss"
    summary:     str = ""       # 1-sentence summary of what happens in this chapter
    key_topics:  list[str] = field(default_factory=list)   # 2-3 keywords for UI tags

@dataclass
class ChapterResult:
    media_id:  str
    chapters:  list[Chapter] = field(default_factory=list)
    error:     str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _fmt(seconds: int) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def _clean_json(raw: str) -> str:
    return re.sub(r"```(?:json)?", "", raw).strip()


# ─────────────────────────────────────────────────────────────────────────────
# Bucketing: semantic-aware windowing
# ─────────────────────────────────────────────────────────────────────────────

# Topic-shift signals: words that typically open a new section
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
    """
    Splits transcript into chapter buckets using a hybrid strategy:
      1. Primary split: time window (default 4 minutes)
      2. Early split: if a topic-shift signal appears AND the current window
         is already >60 seconds old — triggers a chapter boundary sooner.
      3. Merge: drop buckets with fewer than `min_words` words into the previous one.

    Works on ANY Documents list with metadata['start'] (seconds).
    """
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


def _merge_short_buckets(buckets: list[dict], min_words: int) -> list[dict]:
    """Merge any bucket with too few words into the previous one."""
    merged = []
    for b in buckets:
        word_count = len(b["text"].split())
        if merged and word_count < min_words:
            merged[-1]["text"] += " " + b["text"]
        else:
            merged.append(b)
    return merged


# ─────────────────────────────────────────────────────────────────────────────
# LLM prompt: richer output (title + summary + key_topics)
# ─────────────────────────────────────────────────────────────────────────────

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


def _llm_title_for_bucket(bucket: dict, idx: int) -> Chapter:
    """
    Call the LLM to generate title + summary + key_topics for one bucket.
    Falls back to safe defaults if anything fails.
    """
    try:
        chain  = _CHAPTER_PROMPT | _llm | JsonOutputParser()
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
        summary    = summary,
        key_topics = key_topics,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def detect_chapters_from_docs(
    docs:         list[Document],
    media_id:     str,
    window_sec:   int = 240,
    max_chapters: int = 7,
) -> ChapterResult:
    """
    Source-agnostic chapter detector.
    Works on any list of LangChain Documents with optional metadata['start'].

    Parameters
    ----------
    docs         : transcript documents (YouTube, Whisper, uploaded audio, etc.)
    media_id     : identifier for logging / response payload
    window_sec   : minimum seconds per chapter before a time-based split
    max_chapters : hard cap on number of chapters
    """
    result = ChapterResult(media_id=media_id)

    if not docs:
        result.error = "No transcript available."
        return result

    buckets = bucket_transcript(docs, window_sec=window_sec, max_chapters=max_chapters)

    if not buckets:
        result.error = "Could not segment the transcript into chapters."
        return result

    chapters = [_llm_title_for_bucket(b, i) for i, b in enumerate(buckets)]
    result.chapters = chapters
    return result


def detect_chapters(video_id: str) -> dict:
    """
    YouTube-specific convenience wrapper.
    Called by the FastAPI route.
    """
    docs   = load_youtube_docs(video_id)
    result = detect_chapters_from_docs(docs, media_id=video_id)
    return result.to_dict()