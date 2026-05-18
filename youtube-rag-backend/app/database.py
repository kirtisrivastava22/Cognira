"""
database.py
-----------
SQLite database layer replacing all JSON file caches.
Handles: media metadata, transcripts, users/sessions.
Thread-safe with connection pooling via SQLAlchemy.
"""

from __future__ import annotations

import json
import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from sqlalchemy import (
    Column, String, Integer, Boolean, Text, Float,
    DateTime, create_engine, text
)
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, sessionmaker
from sqlalchemy.sql import func

log = logging.getLogger("database")

DB_PATH = Path("cognira.db")
ENGINE  = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
    pool_size=10,
    max_overflow=20,
    echo=False,
)
SessionLocal = sessionmaker(bind=ENGINE, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


class MediaRecord(Base):
    __tablename__ = "media"

    media_id    = Column(String(32),  primary_key=True)
    source_type = Column(String(32),  nullable=False)          # youtube|upload|docx|direct
    title       = Column(Text,        nullable=True)
    source_url  = Column(Text,        nullable=True)
    local_path  = Column(Text,        nullable=True)
    word_count  = Column(Integer,     nullable=True)
    truncated   = Column(Boolean,     default=False)
    full_text   = Column(Text,        nullable=True)           # DOCX full text cache
    created_at  = Column(DateTime,    server_default=func.now())
    extra_json: Optional[str] = Column(Text,        default="{}")            # extensible metadata


class TranscriptRecord(Base):
    __tablename__ = "transcripts"

    media_id    = Column(String(32), primary_key=True)
    chunks_json = Column(Text,       nullable=False)           # JSON list of {text, start}
    created_at  = Column(DateTime,  server_default=func.now())


class UserRecord(Base):
    __tablename__ = "users"

    user_id    = Column(String(128),  primary_key=True)        # email_name hash
    name       = Column(String(256),  nullable=True)
    email      = Column(String(256),  nullable=True)
    created_at = Column(DateTime,    server_default=func.now())
    last_seen  = Column(DateTime,    server_default=func.now(), onupdate=func.now())


class HistoryRecord(Base):
    __tablename__ = "history"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(String(128), nullable=False, index=True)
    media_id   = Column(String(32),  nullable=False)
    title      = Column(Text,        nullable=True)
    source_type = Column(String(32), nullable=True)
    viewed_at  = Column(DateTime,    server_default=func.now())


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(ENGINE)
    log.info("Database initialised at %s", DB_PATH.resolve())


@contextmanager
def get_session():
    """Context manager yielding a DB session with auto-commit/rollback."""
    session: Session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


# ─────────────────────────────────────────────────────────────────────────────
# Media CRUD
# ─────────────────────────────────────────────────────────────────────────────

def save_media(meta: dict):
    with get_session() as db:
        # Pull known columns; put rest in extra_json
        known = {"media_id", "source_type", "title", "source_url",
                 "local_path", "word_count", "truncated", "full_text"}
        extra = {k: v for k, v in meta.items() if k not in known}

        rec = db.get(MediaRecord, meta["media_id"])
        if rec:
            for k in known - {"media_id"}:
                if k in meta:
                    setattr(rec, k, meta[k])
            rec.extra_json = json.dumps(extra)
        else:
            rec = MediaRecord(
                media_id    = meta["media_id"],
                source_type = meta.get("source_type", "unknown"),
                title       = meta.get("title"),
                source_url  = meta.get("source_url"),
                local_path  = meta.get("local_path"),
                word_count  = meta.get("word_count"),
                truncated   = meta.get("truncated", False),
                full_text   = meta.get("full_text"),
                extra_json  = json.dumps(extra),
            )
            db.add(rec)


def get_media(media_id: str) -> Optional[dict]:
    with get_session() as db:
        rec = db.get(MediaRecord, media_id)
        if not rec:
            return None
        d = {
            "media_id":    rec.media_id,
            "source_type": rec.source_type,
            "title":       rec.title,
            "source_url":  rec.source_url,
            "local_path":  rec.local_path,
            "word_count":  rec.word_count,
            "truncated":   rec.truncated,
            "full_text":   rec.full_text,
        }
        try:
            d.update(json.loads(rec.extra_json or "{}"))
        except Exception:
            pass
        return d


# ─────────────────────────────────────────────────────────────────────────────
# Transcript CRUD
# ─────────────────────────────────────────────────────────────────────────────

def save_transcript_db(media_id: str, chunks: list[dict]):
    with get_session() as db:
        rec = db.get(TranscriptRecord, media_id)
        if rec:
            rec.chunks_json = json.dumps(chunks, ensure_ascii=False)
        else:
            db.add(TranscriptRecord(
                media_id    = media_id,
                chunks_json = json.dumps(chunks, ensure_ascii=False),
            ))


def load_transcript_db(media_id: str) -> Optional[list[dict]]:
    with get_session() as db:
        rec = db.get(TranscriptRecord, media_id)
        if not rec:
            return None
        return json.loads(rec.chunks_json)


# ─────────────────────────────────────────────────────────────────────────────
# User / History CRUD
# ─────────────────────────────────────────────────────────────────────────────

def upsert_user(user_id: str, name: str, email: str):
    with get_session() as db:
        rec = db.get(UserRecord, user_id)
        if rec:
            rec.name = name
            rec.email = email
        else:
            db.add(UserRecord(user_id=user_id, name=name, email=email))


def add_history(user_id: str, media_id: str, title: str, source_type: str):
    with get_session() as db:
        # Deduplicate: remove older entry for same media_id
        db.execute(
            text("DELETE FROM history WHERE user_id=:uid AND media_id=:mid"),
            {"uid": user_id, "mid": media_id},
        )
        db.add(HistoryRecord(
            user_id=user_id, media_id=media_id,
            title=title, source_type=source_type,
        ))


def get_history(user_id: str, limit: int = 50) -> list[dict]:
    with get_session() as db:
        rows = (
            db.query(HistoryRecord)
            .filter(HistoryRecord.user_id == user_id)
            .order_by(HistoryRecord.viewed_at.desc())
            .limit(limit)
            .all()
        )
        return [
            {
                "media_id":    r.media_id,
                "title":       r.title,
                "source_type": r.source_type,
                "viewed_at":   r.viewed_at.isoformat() if r.viewed_at else None,
            }
            for r in rows
        ]