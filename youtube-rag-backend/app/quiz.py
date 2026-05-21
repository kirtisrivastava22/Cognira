"""
Generates multiple-choice quizzes from video transcripts.

Design goals:
  - Accuracy-first: facts extracted separately from question generation
  - Difficulty support: easy / medium / hard (ready for adaptive UI)
  - Source-agnostic: works on any list of LangChain Documents, not just YouTube
  - Extensible: QuizResult dataclass makes it easy to add new fields later
  - Resilient: every LLM call is wrapped; partial results are returned gracefully
"""

from __future__ import annotations

import json
import random
import re
from dataclasses import dataclass, field, asdict
from typing import Literal

from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document

from app.rag import load_youtube_docs
import os

# ─────────────────────────────────────────────────────────────────────────────
# LLM  (70b for quality; isolated here so it's easy to swap)
# ─────────────────────────────────────────────────────────────────────────────
def _make_llm(temperature: float = 0.2, max_tokens: int = 1500):
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        return None
    from langchain_groq import ChatGroq
    return ChatGroq(
        model="llama-3.3-70b-versatile",
        temperature=temperature,
        max_tokens=max_tokens,
    )



# ─────────────────────────────────────────────────────────────────────────────
# Types / dataclasses
# ─────────────────────────────────────────────────────────────────────────────

Difficulty = Literal["easy", "medium", "hard"]

@dataclass
class QuizQuestion:
    question:    str
    options:     list[str]
    correct:     int           # index into options[]
    explanation: str
    difficulty:  Difficulty = "medium"
    source_fact: str = ""      # the transcript fact it was generated from
    timestamp:   str = ""      # [mm:ss] of source chunk, if available

@dataclass
class QuizResult:
    video_id:  str
    questions: list[QuizQuestion] = field(default_factory=list)
    error:     str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ─────────────────────────────────────────────────────────────────────────────
# Content filters
# ─────────────────────────────────────────────────────────────────────────────

_BAD_KEYWORDS = {
    "host", "speaker", "playlist", "channel", "subscribe", "like", "comment",
    "welcome", "my name", "this channel", "introduced", "i am from",
    "today we", "in this video", "don't forget", "hit the bell",
}

def _is_valid_fact(fact: str) -> bool:
    lower = fact.lower()
    return (
        len(fact.strip()) > 20
        and not any(k in lower for k in _BAD_KEYWORDS)
    )

def _clean_json(raw: str) -> str:
    """Strip markdown fences and leading/trailing noise from LLM output."""
    raw = re.sub(r"```(?:json)?", "", raw).strip()
    return raw


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — sample transcript into topic windows
# ─────────────────────────────────────────────────────────────────────────────

def _sample_windows(docs: list[Document], num_windows: int = 6) -> list[dict]:
    """
    Split the full doc list into evenly-spaced windows.
    Each window = {text, start_time}.
    Works on any list of Documents with metadata['start'] (seconds).
    Falls back gracefully if metadata is absent.
    """
    if not docs:
        return []

    docs = sorted(docs, key=lambda d: d.metadata.get("start", 0))
    n = len(docs)
    step = max(1, n // num_windows)

    windows = []
    for i in range(0, n, step):
        chunk = docs[i : i + 6]
        text  = " ".join(d.page_content for d in chunk)
        start = chunk[0].metadata.get("start", 0)
        mm, ss = divmod(int(start), 60)
        windows.append({
            "text":      text[:900],   # hard cap to stay in token budget
            "start":     start,
            "timestamp": f"{mm:02d}:{ss:02d}",
        })
        if len(windows) >= num_windows:
            break

    return windows


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — extract factual statements per window
# ─────────────────────────────────────────────────────────────────────────────

_FACT_PROMPT = PromptTemplate.from_template(
"""You are extracting quiz facts from a technical transcript segment.

Extract 2-3 FACTUAL CONCEPT STATEMENTS. Include only:
- Definitions
- System components or architecture
- Technical processes or comparisons
- Specific numbers or metrics related to systems

Exclude completely:
- Audience level, speaker info, channel info, greetings
- Opinions or subjective statements

GOOD: "A load balancer distributes traffic across multiple server instances."
BAD:  "In this video we will learn about microservices."

Respond with ONLY a JSON array, no explanation, no markdown:
["Fact 1", "Fact 2"]

Transcript segment:
{text}

JSON:"""
)

def _extract_facts(windows: list[dict]) -> list[dict]:
    """Returns list of {fact, timestamp} dicts."""
    results = []

    for window in windows:
        try:
            _llm = _make_llm()
            if _llm is None:
                raise RuntimeError("No LLM configured")
            chain  = _FACT_PROMPT | _llm
            response = chain.invoke({"text": window["text"]})
            content = response.content
            if isinstance(content, list):
                facts = content
            else:
                raw = content.strip()
                raw = _clean_json(raw)
                if not raw.startswith("["):
                    continue
                facts = json.loads(raw)
            for f in facts:
                if isinstance(f, str) and _is_valid_fact(f):
                    results.append({"fact": f, "timestamp": window["timestamp"]})

        except Exception as exc:
            print(f"[quiz._extract_facts] {exc}")
            continue

    return results


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — generate one MCQ from a fact
# ─────────────────────────────────────────────────────────────────────────────

_DIFFICULTY_GUIDANCE = {
    "easy":   "Use straightforward language. The correct answer should be obvious to someone who watched the video.",
    "medium": "Require understanding, not just recall. Distractors should be plausible but clearly wrong on reflection.",
    "hard":   "Require deep understanding. All distractors should be plausible; the correct answer requires careful reasoning.",
}

_QUESTION_PROMPT = PromptTemplate.from_template(
"""Create a multiple-choice question that tests understanding of this concept.

Difficulty: {difficulty}
Guidance: {difficulty_guidance}

Rules:
- Question tests the concept in the fact, NOT the video topic or speaker
- 4 options total; exactly one is correct
- Distractors must be clearly wrong but not obviously silly
- Explanation must reference the fact

Return ONLY this JSON, no markdown, no extra text:
{{
  "question":    "...",
  "options":     ["correct answer", "distractor 1", "distractor 2", "distractor 3"],
  "explanation": "..."
}}

Fact: {fact}

JSON:"""
)

def _generate_question(
    fact: str,
    timestamp: str = "",
    difficulty: Difficulty = "medium",
) -> QuizQuestion | None:

    try:
        _llm = _make_llm()
        if _llm is None:
            raise RuntimeError("No LLM configured")
        chain = _QUESTION_PROMPT | _llm
        response = chain.invoke({
            "fact":                fact,
            "difficulty":          difficulty,
            "difficulty_guidance": _DIFFICULTY_GUIDANCE[difficulty],
        })

        content = response.content
        if isinstance(content, dict):
            raw = json.dumps(content)
        elif isinstance(content, list):
            if len(content) == 1:
                item = content[0]
                raw = json.dumps(item) if not isinstance(item, str) else item.strip()
            elif all(isinstance(item, str) for item in content):
                raw = " ".join(item.strip() for item in content).strip()
            else:
                raw = json.dumps(content)
        else:
            raw = content.strip()

        raw = _clean_json(raw)
        if "{" in raw:
            raw = raw[raw.find("{") : raw.rfind("}") + 1]

        data = json.loads(raw)

        correct_text = data["options"][0]
        options      = data["options"][:]
        random.shuffle(options)

        return QuizQuestion(
            question    = data["question"],
            options     = options,
            correct     = options.index(correct_text),
            explanation = data.get("explanation", ""),
            difficulty  = difficulty,
            source_fact = fact,
            timestamp   = timestamp,
        )

    except Exception as exc:
        print(f"[quiz._generate_question] {exc}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def generate_quiz_from_docs(
    docs:          list[Document],
    media_id:      str,
    num_questions: int = 5,
    difficulty:    Difficulty = "medium",
) -> QuizResult:
    """
    Source-agnostic quiz generator.
    Works on ANY list of LangChain Documents with optional metadata['start'].

    Parameters
    ----------
    docs          : transcript documents (any source — YouTube, audio, upload)
    media_id      : identifier used for logging and the result payload
    num_questions : how many questions to return
    difficulty    : "easy" | "medium" | "hard"
    """
    result = QuizResult(video_id=media_id)

    if not docs:
        result.error = "No transcript content available."
        return result

    # 1. Sample windows across the content
    windows = _sample_windows(docs, num_windows=min(8, num_questions * 2))

    # 2. Extract facts
    fact_objects = _extract_facts(windows)
    if not fact_objects:
        result.error = "Could not extract facts from the transcript."
        return result

    print(f"[quiz] Extracted {len(fact_objects)} facts for {media_id}")

    # 3. Generate questions  (try up to 2× target to cover failures)
    questions: list[QuizQuestion] = []
    for fo in fact_objects[: num_questions * 2]:
        q = _generate_question(fo["fact"], fo["timestamp"], difficulty)
        if q:
            questions.append(q)
        if len(questions) >= num_questions:
            break

    if not questions:
        result.error = "Question generation failed for all extracted facts."
        return result

    result.questions = questions[:num_questions]
    return result


def generate_quiz(
    video_id:      str,
    num_questions: int = 5,
    difficulty:    Difficulty = "medium",
) -> dict:
    """
    YouTube-specific convenience wrapper.
    Called by the FastAPI route.
    """
    docs   = load_youtube_docs(video_id)
    result = generate_quiz_from_docs(docs, video_id, num_questions, difficulty)
    return result.to_dict()