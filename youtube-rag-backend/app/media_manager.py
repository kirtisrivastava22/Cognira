"""
media_manager.py  (production rewrite)
---------------------------------------
All metadata now stored in SQLite via app.database.
File I/O only for actual media files.
"""

import os
import uuid
import subprocess
from pathlib import Path
from typing import Any, Optional, Tuple

import requests
from yt_dlp import YoutubeDL

from app.database import save_media, get_media

MEDIA_DIR = Path("media")
MEDIA_DIR.mkdir(exist_ok=True)


def create_media_id() -> str:
    return uuid.uuid4().hex[:12]


def is_youtube_url(url: str) -> bool:
    return "youtube.com/watch" in url or "youtu.be/" in url


def download_from_url(url: str, media_id: str) -> Tuple[str, str]:
    """Returns (local_path, source_type)."""
    out_dir = MEDIA_DIR / media_id
    out_dir.mkdir(parents=True, exist_ok=True)

    if is_youtube_url(url):
        ydl_opts: Any = {
            "outtmpl":    str(out_dir / "%(title).80s.%(ext)s"),
            "format":     "mp4/bestaudio+bestaudio/best",
            "quiet":      True,
            "no_warnings": True,
        }
        with YoutubeDL(ydl_opts) as ydl:
            info     = ydl.extract_info(url, download=True)
            filepath = ydl.prepare_filename(info)
        return filepath, "youtube"

    ext = ".mp4"
    for e in (".mp3", ".wav", ".mkv"):
        if e in url:
            ext = e
            break

    filepath = out_dir / f"source{ext}"
    r = requests.get(url, stream=True, timeout=30)
    r.raise_for_status()
    with open(filepath, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)

    return str(filepath), "direct"


def save_uploaded_file(file_obj, media_id: str) -> str:
    out_dir = MEDIA_DIR / media_id
    out_dir.mkdir(parents=True, exist_ok=True)
    filename = file_obj.filename or "upload.mp4"
    filepath = out_dir / filename
    with open(filepath, "wb") as f:
        f.write(file_obj.file.read())
    return str(filepath)


def extract_audio(media_path: str, media_id: str) -> str:
    """Convert video/audio to 16kHz mono WAV for Whisper."""
    out_dir    = MEDIA_DIR / media_id
    out_dir.mkdir(parents=True, exist_ok=True)
    audio_path = out_dir / "audio.wav"

    cmd = [
        "ffmpeg", "-y", "-i", media_path,
        "-vn", "-ac", "1", "-ar", "16000",
        str(audio_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr}")
    return str(audio_path)


def register_media(media_id: str, meta: dict):
    """Persist media metadata to SQLite."""
    save_media(meta)


def get_media_meta(media_id: str) -> Optional[dict]:
    """Retrieve media metadata from SQLite."""
    return get_media(media_id)