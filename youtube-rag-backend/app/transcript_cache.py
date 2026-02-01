import json
import os

CACHE_DIR = "cache/transcripts"
os.makedirs(CACHE_DIR, exist_ok=True)

def transcript_cache_path(video_id: str):
    return os.path.join(CACHE_DIR, f"{video_id}.json")


def load_cached_transcript(video_id: str):
    path = transcript_cache_path(video_id)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def save_transcript(video_id: str, transcript: list):
    path = transcript_cache_path(video_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(transcript, f, ensure_ascii=False)
