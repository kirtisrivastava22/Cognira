from __future__ import annotations

import json
import re
import sys

from app.main import _build_docs
from app.quiz import _sample_windows, _extract_facts
_YT_ID_RE = re.compile(r"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})")


def normalize_media_id(raw: str) -> str:
    cleaned = raw.strip().strip("[],")
    m = _YT_ID_RE.search(cleaned)
    return m.group(1) if m else cleaned


def draft_entries_for_media(media_id: str, num_windows: int = 6) -> list[dict]:
    docs = _build_docs(media_id)
    if not docs:
        print(f"  ! no transcript/content for {media_id}, skipping", file=sys.stderr)
        return []

    windows = _sample_windows(docs, num_windows=num_windows)
    facts = _extract_facts(windows)  

    entries = []
    for f in facts:
        fact_text = f["fact"]
        words = re.findall(r"[a-zA-Z]{4,}", fact_text)
        keywords = sorted(set(words), key=len, reverse=True)[:2]
        entries.append({
            "media_id":         media_id,
            "question":         f"What does the content say about: {fact_text[:70]}?",
            "expect_keywords":  keywords,
            "expect_confident": True,
            "_source_fact":     fact_text,   
        })
    return entries


if __name__ == "__main__":
    media_ids = sys.argv[1:]
    if not media_ids:
        print("Usage: python build_gold_set.py <media_id> [<media_id> ...]", file=sys.stderr)
        sys.exit(1)

    all_entries = []
    for raw in media_ids:
        mid = normalize_media_id(raw)
        print(f"Drafting gold entries for {mid} (from '{raw}') ...", file=sys.stderr)
        all_entries.extend(draft_entries_for_media(mid))

    print(json.dumps(all_entries, indent=2))