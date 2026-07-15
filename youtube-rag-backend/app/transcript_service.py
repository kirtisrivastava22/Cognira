from typing import List
from faster_whisper import WhisperModel
from langchain_core.documents import Document

from app.transcript_cache import load_cached_transcript, save_transcript
from app.media_manager import get_media_meta, extract_audio

_whisper_model = None


def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
    return _whisper_model


def _docs_from_transcript_rows(rows) -> List[Document]:
    docs = []
    for item in rows:
        text = item["text"].replace("\n", " ").strip()
        if not text:
            continue
        docs.append(Document(page_content=text, metadata={"start": int(item["start"])}))
    return docs


def transcribe_media_file(media_path: str):
    model = get_whisper_model()
    segments, _ = model.transcribe(media_path, vad_filter=True)

    normalized = []
    for seg in segments:
        text = (seg.text or "").strip()
        if text:
            normalized.append({"text": text, "start": int(seg.start)})

    return normalized


def load_media_docs(media_id: str) -> List[Document]:
    # transcript JSON cache 
    cached = load_cached_transcript(media_id)
    if cached:
        return _docs_from_transcript_rows(cached)

    # Need to transcribe -> look up media metadata
    meta = get_media_meta(media_id)
    if not meta:
        return []

    media_path = meta.get("local_path")
    if not media_path:
        return []

    if not media_path.endswith((".mp3", ".wav")):
        media_path = extract_audio(media_path, media_id=media_id)

    rows = transcribe_media_file(media_path)
    if not rows:
        return []

    save_transcript(media_id, rows)

    return _docs_from_transcript_rows(rows)
