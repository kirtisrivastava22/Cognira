import os
import uuid
import json
import subprocess
from pathlib import Path
from typing import Optional, Dict, Tuple, Any

import requests
from yt_dlp import YoutubeDL

MEDIA_DIR = Path("media")
MEDIA_DIR.mkdir(exist_ok=True)

INDEX_FILE = MEDIA_DIR / "index.json"


def _load_index() -> dict:
    if INDEX_FILE.exists():
        with open(INDEX_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def _save_index(index: dict):
    with open(INDEX_FILE, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)


def create_media_id() -> str:
    return uuid.uuid4().hex[:12]


def is_youtube_url(url: str) -> bool:
    return "youtube.com/watch" in url or "youtu.be/" in url


def download_from_url(url: str, media_id: str) -> Tuple[str, str]:
    """
    Returns (local_path, source_type)
    source_type: youtube | direct
    """
    out_dir = MEDIA_DIR / media_id
    out_dir.mkdir(parents=True, exist_ok=True)

    if is_youtube_url(url):
        ydl_opts = {
            "outtmpl": str(out_dir / "%(title).80s.%(ext)s"),
            "format": "mp4/bestaudio+bestaudio/best",
            "quiet": True,
            "no_warnings": True,
        }
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filepath = ydl.prepare_filename(info)
        return filepath, "youtube"

    # direct file URL
    ext = ".mp4"
    if ".mp3" in url:
        ext = ".mp3"
    elif ".wav" in url:
        ext = ".wav"
    elif ".mkv" in url:
        ext = ".mkv"

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
    """
    Converts video/audio into wav for transcription.
    """
    out_dir = MEDIA_DIR / media_id
    out_dir.mkdir(parents=True, exist_ok=True)
    audio_path = out_dir / "audio.wav"

    cmd = [
        "ffmpeg",
        "-y",
        "-i", media_path,
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        str(audio_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)
    return str(audio_path)


def register_media(media_id: str, meta: dict):
    index = _load_index()
    index[media_id] = meta
    _save_index(index)


def get_media_meta(media_id: str) -> Optional[dict]:
    return _load_index().get(media_id)