"""
database.py
-----------
SQLite database layer replacing all JSON file caches.
Handles: media metadata, transcripts, users/sessions, conversations.
Thread-safe with connection pooling via SQLAlchemy.
"""

from __future__ import annotations

import json
import logging
import secrets
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
    source_type = Column(String(32),  nullable=False)
    title       = Column(Text,        nullable=True)
    source_url  = Column(Text,        nullable=True)
    local_path  = Column(Text,        nullable=True)
    word_count  = Column(Integer,     nullable=True)
    truncated   = Column(Boolean,     default=False)
    full_text   = Column(Text,        nullable=True)
    created_at  = Column(DateTime,    server_default=func.now())
    extra_json: Optional[str] = Column(Text, default="{}")


class TranscriptRecord(Base):
    __tablename__ = "transcripts"

    media_id    = Column(String(32), primary_key=True)
    chunks_json = Column(Text,       nullable=False)
    created_at  = Column(DateTime,  server_default=func.now())


class UserRecord(Base):
    __tablename__ = "users"

    user_id    = Column(String(128),  primary_key=True)
    name       = Column(String(256),  nullable=True)
    email      = Column(String(256),  nullable=True)
    created_at = Column(DateTime,    server_default=func.now())
    last_seen  = Column(DateTime,    server_default=func.now(), onupdate=func.now())


class HistoryRecord(Base):
    __tablename__ = "history"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(String(128), nullable=False, index=True)
    media_id    = Column(String(32),  nullable=False)
    title       = Column(Text,        nullable=True)
    source_type = Column(String(32),  nullable=True)
    viewed_at   = Column(DateTime,    server_default=func.now())


class ConversationRecord(Base):
    """
    Persistent conversation per media session.
    One conversation = many Q&A turns (stored as JSON array).
    """
    __tablename__ = "conversations"

    conv_id      = Column(String(32),  primary_key=True)
    user_id      = Column(String(128), nullable=False, index=True)
    media_id     = Column(String(32),  nullable=False, index=True)
    title        = Column(Text,        nullable=False, default="New conversation")
    messages_json = Column(Text,       nullable=False, default="[]")
    pinned       = Column(Boolean,     default=False)
    share_token  = Column(String(64),  nullable=True, unique=True, index=True)
    created_at   = Column(DateTime,    server_default=func.now())
    updated_at   = Column(DateTime,    server_default=func.now(), onupdate=func.now())


def init_db():
    """Create all tables if they don't exist."""
    Base.metadata.create_all(ENGINE)
    log.info("Database initialised at %s", DB_PATH.resolve())


@contextmanager
def get_session():
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


# ─────────────────────────────────────────────────────────────────────────────
# Conversation CRUD
# ─────────────────────────────────────────────────────────────────────────────

def _conv_to_dict(r: ConversationRecord) -> dict:
    return {
        "conv_id":    r.conv_id,
        "user_id":    r.user_id,
        "media_id":   r.media_id,
        "title":      r.title,
        "messages":   json.loads(r.messages_json or "[]"),
        "pinned":     r.pinned,
        "share_token": r.share_token,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def create_conversation(user_id: str, media_id: str, title: str = "New conversation") -> dict:
    """Create a blank conversation and return it."""
    conv_id = secrets.token_hex(16)
    with get_session() as db:
        rec = ConversationRecord(
            conv_id=conv_id,
            user_id=user_id,
            media_id=media_id,
            title=title,
            messages_json="[]",
            pinned=False,
        )
        db.add(rec)
    return get_conversation(conv_id)


def get_conversation(conv_id: str) -> Optional[dict]:
    with get_session() as db:
        rec = db.get(ConversationRecord, conv_id)
        return _conv_to_dict(rec) if rec else None


def get_conversation_by_token(share_token: str) -> Optional[dict]:
    with get_session() as db:
        rec = db.query(ConversationRecord).filter(
            ConversationRecord.share_token == share_token
        ).first()
        return _conv_to_dict(rec) if rec else None


def list_conversations(user_id: str, media_id: Optional[str] = None, limit: int = 100) -> list[dict]:
    with get_session() as db:
        q = db.query(ConversationRecord).filter(ConversationRecord.user_id == user_id)
        if media_id:
            q = q.filter(ConversationRecord.media_id == media_id)
        rows = q.order_by(
            ConversationRecord.pinned.desc(),
            ConversationRecord.updated_at.desc()
        ).limit(limit).all()
        return [_conv_to_dict(r) for r in rows]


def append_messages(conv_id: str, messages: list[dict]) -> Optional[dict]:
    """Append one or more {question, answer} turns to a conversation."""
    with get_session() as db:
        rec = db.get(ConversationRecord, conv_id)
        if not rec:
            return None
        existing = json.loads(rec.messages_json or "[]")
        existing.extend(messages)
        rec.messages_json = json.dumps(existing, ensure_ascii=False)
        # Auto-title from first question if still default
        if rec.title == "New conversation" and messages:
            first_q = messages[0].get("question", "")
            rec.title = (first_q[:60] + "…") if len(first_q) > 60 else first_q
    return get_conversation(conv_id)


def rename_conversation(conv_id: str, title: str) -> Optional[dict]:
    with get_session() as db:
        rec = db.get(ConversationRecord, conv_id)
        if not rec:
            return None
        rec.title = title[:200]
    return get_conversation(conv_id)


def pin_conversation(conv_id: str, pinned: bool) -> Optional[dict]:
    with get_session() as db:
        rec = db.get(ConversationRecord, conv_id)
        if not rec:
            return None
        rec.pinned = pinned
    return get_conversation(conv_id)


def delete_conversation(conv_id: str) -> bool:
    with get_session() as db:
        rec = db.get(ConversationRecord, conv_id)
        if not rec:
            return False
        db.delete(rec)
    return True


def generate_share_token(conv_id: str) -> Optional[str]:
    """Create (or return existing) share token for a conversation."""
    with get_session() as db:
        rec = db.get(ConversationRecord, conv_id)
        if not rec:
            return None
        if not rec.share_token:
            rec.share_token = secrets.token_urlsafe(32)
        return rec.share_token


def revoke_share_token(conv_id: str) -> bool:
    with get_session() as db:
        rec = db.get(ConversationRecord, conv_id)
        if not rec:
            return False
        rec.share_token = None
    return True