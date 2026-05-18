"""
transcript_cache.py  (production rewrite)
------------------------------------------
Transcript caching via SQLite (app.database).
File-based JSON cache is retained as fallback for migration compatibility.
"""

import json
import os
import logging
from typing import Optional

from app.database import save_transcript_db, load_transcript_db

log = logging.getLogger("transcript_cache")

# Legacy file cache path (kept for migration only)
CACHE_DIR = "cache/transcripts"
os.makedirs(CACHE_DIR, exist_ok=True)


def transcript_cache_path(video_id: str) -> str:
    return os.path.join(CACHE_DIR, f"{video_id}.json")


def load_cached_transcript(video_id: str) -> Optional[list]:
    # 1. Try DB first
    result = load_transcript_db(video_id)
    if result:
        return result

    # 2. Fallback: legacy JSON file (migrate it into DB)
    path = transcript_cache_path(video_id)
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Migrate into DB
            save_transcript_db(video_id, data)
            log.info("Migrated transcript %s from file to DB", video_id)
            return data
        except Exception as e:
            log.warning("Failed to read legacy transcript %s: %s", video_id, e)

    return None


def save_transcript(video_id: str, transcript: list):
    """Save to DB (primary) and legacy file (backup)."""
    save_transcript_db(video_id, transcript)

    # Also write legacy file as backup
    path = transcript_cache_path(video_id)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(transcript, f, ensure_ascii=False)
    except Exception as e:
        log.warning("Could not write legacy transcript file %s: %s", video_id, e)