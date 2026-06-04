from __future__ import annotations

import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from pymongo import MongoClient, DESCENDING, ASCENDING
from pymongo.collection import Collection

log = logging.getLogger("database")

# ─────────────────────────────────────────────────────────────────────────────
# Connection
# ─────────────────────────────────────────────────────────────────────────────

_MONGO_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/cognira")
_client: Optional[MongoClient] = None


def _get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(_MONGO_URI, serverSelectionTimeoutMS=5000)
    return _client


def _db():
    return _get_client().get_default_database()


def _col(name: str) -> Collection:
    return _db()[name]


SESSION_TTL_DAYS = 30
MAX_FAILED_TRIES = 10
LOCK_MINUTES     = 15


# ─────────────────────────────────────────────────────────────────────────────
# Init  (called on startup — creates indexes)
# ─────────────────────────────────────────────────────────────────────────────

def init_db():
    try:
        users  = _col("users")
        users.create_index("email", unique=True)

        sessions = _col("sessions")
        sessions.create_index("token", unique=True)
        sessions.create_index("expires_at", expireAfterSeconds=0)   # TTL index

        history = _col("history")
        history.create_index([("user_id", ASCENDING), ("viewed_at", DESCENDING)])

        convs = _col("conversations")
        convs.create_index("user_id")
        convs.create_index("share_token", sparse=True)

        _col("media").create_index("media_id", unique=True)
        _col("transcripts").create_index("media_id", unique=True)

        log.info("MongoDB initialised — URI prefix: %s", _MONGO_URI[:40])
    except Exception as e:
        log.error("MongoDB init failed: %s", e)
        raise


# ─────────────────────────────────────────────────────────────────────────────
# Password helpers
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(plaintext: str) -> str:
    return bcrypt.hashpw(plaintext.encode(), bcrypt.gensalt(rounds=12)).decode()


def verify_password(plaintext: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plaintext.encode(), hashed.encode())
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# User CRUD
# ─────────────────────────────────────────────────────────────────────────────

def _uid_for_email(email: str) -> str:
    import hashlib
    return hashlib.sha256(email.lower().encode()).hexdigest()[:32]


def register_user(name: str, email: str, password: str) -> dict:
    email   = email.strip().lower()
    user_id = _uid_for_email(email)
    pw_hash = hash_password(password)

    users = _col("users")
    if users.find_one({"email": email}):
        raise ValueError("An account with this email already exists.")

    now = datetime.now(timezone.utc)
    users.insert_one({
        "user_id":         user_id,
        "name":            name.strip()[:200],
        "email":           email,
        "password_hash":   pw_hash,
        "created_at":      now,
        "last_seen":       now,
        "failed_attempts": 0,
        "locked_until":    None,
    })
    return {"user_id": user_id, "name": name.strip(), "email": email}


def authenticate_user(email: str, password: str) -> dict:
    email = email.strip().lower()
    _DUMMY = "$2b$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxxx"

    users = _col("users")
    rec   = users.find_one({"email": email})

    stored_hash = (rec.get("password_hash") or _DUMMY) if rec else _DUMMY
    password_ok = verify_password(password, stored_hash)

    if not rec:
        raise ValueError("Invalid email or password.")

    now = datetime.now(timezone.utc)
    locked = rec.get("locked_until")
    if locked and (locked if locked.tzinfo else locked.replace(tzinfo=timezone.utc)) > now:
        mins = int(((locked if locked.tzinfo else locked.replace(tzinfo=timezone.utc)) - now).total_seconds() // 60) + 1
        raise ValueError(f"Account locked. Try again in {mins} minute(s).")

    if not rec.get("password_hash"):
        raise ValueError("No password set on this account. Please register again.")

    if not password_ok:
        new_attempts = int(rec.get("failed_attempts", 0)) + 1
        update: dict = {"failed_attempts": new_attempts}
        if new_attempts >= MAX_FAILED_TRIES:
            update["locked_until"]    = now + timedelta(minutes=LOCK_MINUTES)
            update["failed_attempts"] = 0
        users.update_one({"email": email}, {"$set": update})
        raise ValueError("Invalid email or password.")

    users.update_one({"email": email}, {"$set": {
        "failed_attempts": 0,
        "locked_until":    None,
        "last_seen":       now,
    }})
    return {"user_id": rec["user_id"], "name": rec["name"], "email": rec["email"]}


def upsert_user(user_id: str, name: str, email: str):
    now = datetime.now(timezone.utc)
    _col("users").update_one(
        {"user_id": user_id},
        {"$set": {"name": name, "email": email.lower(), "last_seen": now}},
        upsert=True,
    )


def get_user_by_id(user_id: str) -> Optional[dict]:
    rec = _col("users").find_one({"user_id": user_id})
    if not rec:
        return None
    return {"user_id": rec["user_id"], "name": rec["name"], "email": rec["email"]}


# ─────────────────────────────────────────────────────────────────────────────
# Server-side sessions  (opaque token stored in MongoDB)
# ─────────────────────────────────────────────────────────────────────────────

def create_session_token(user_id: str) -> str:
    token   = secrets.token_urlsafe(48)
    expires = datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS)
    _col("sessions").insert_one({
        "token":      token,
        "user_id":    user_id,
        "created_at": datetime.now(timezone.utc),
        "expires_at": expires,   # MongoDB TTL index auto-deletes expired docs
        "revoked":    False,
    })
    return token


def validate_session_token(token: str) -> Optional[dict]:
    if not token:
        return None
    rec = _col("sessions").find_one({"token": token})
    if not rec or rec.get("revoked"):
        return None
    expires = rec["expires_at"]
    now     = datetime.now(timezone.utc)
    if (expires if expires.tzinfo else expires.replace(tzinfo=timezone.utc)) < now:
        return None
    return get_user_by_id(rec["user_id"])


def revoke_session_token(token: str):
    _col("sessions").update_one({"token": token}, {"$set": {"revoked": True}})


def purge_expired_sessions():
    # MongoDB TTL index handles expiry automatically; manual purge for revoked
    _col("sessions").delete_many({"revoked": True})


# ─────────────────────────────────────────────────────────────────────────────
# Media CRUD
# ─────────────────────────────────────────────────────────────────────────────

def save_media(meta: dict):
    _col("media").update_one(
        {"media_id": meta["media_id"]},
        {"$set": meta},
        upsert=True,
    )


def get_media(media_id: str) -> Optional[dict]:
    rec = _col("media").find_one({"media_id": media_id})
    if not rec:
        return None
    rec.pop("_id", None)
    return rec


# ─────────────────────────────────────────────────────────────────────────────
# Transcript CRUD
# ─────────────────────────────────────────────────────────────────────────────

def save_transcript_db(media_id: str, chunks: list[dict]):
    _col("transcripts").update_one(
        {"media_id": media_id},
        {"$set": {"media_id": media_id, "chunks": chunks, "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )


def load_transcript_db(media_id: str) -> Optional[list[dict]]:
    rec = _col("transcripts").find_one({"media_id": media_id})
    return rec["chunks"] if rec else None


# ─────────────────────────────────────────────────────────────────────────────
# History CRUD
# ─────────────────────────────────────────────────────────────────────────────

def add_history(user_id: str, media_id: str, title: str, source_type: str):
    # Upsert so the same video shows only once, updated to latest viewed_at
    _col("history").update_one(
        {"user_id": user_id, "media_id": media_id},
        {"$set": {
            "title":       title,
            "source_type": source_type,
            "viewed_at":   datetime.now(timezone.utc),
        }},
        upsert=True,
    )


def get_history(user_id: str, limit: int = 50) -> list[dict]:
    rows = (
        _col("history")
        .find({"user_id": user_id}, {"_id": 0})
        .sort("viewed_at", DESCENDING)
        .limit(limit)
    )
    result = []
    for r in rows:
        viewed = r.get("viewed_at")
        result.append({
            "media_id":    r["media_id"],
            "title":       r.get("title"),
            "source_type": r.get("source_type"),
            "viewed_at":   viewed.isoformat() if isinstance(viewed, datetime) else str(viewed),
        })
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Conversation CRUD
# ─────────────────────────────────────────────────────────────────────────────

def _conv_to_dict(r: dict) -> dict:
    r = dict(r)
    r.pop("_id", None)
    created = r.get("created_at")
    updated = r.get("updated_at")
    r["created_at"] = created.isoformat() if isinstance(created, datetime) else created
    r["updated_at"] = updated.isoformat() if isinstance(updated, datetime) else updated
    return r


def create_conversation(user_id: str, media_id: str, title: str = "New conversation") -> dict:
    conv_id = secrets.token_hex(16)
    now     = datetime.now(timezone.utc)
    doc = {
        "conv_id":    conv_id,
        "user_id":    user_id,
        "media_id":   media_id,
        "title":      title,
        "messages":   [],
        "pinned":     False,
        "share_token": None,
        "created_at": now,
        "updated_at": now,
    }
    _col("conversations").insert_one(doc)
    return get_conversation(conv_id)


def get_conversation(conv_id: str) -> Optional[dict]:
    rec = _col("conversations").find_one({"conv_id": conv_id})
    return _conv_to_dict(rec) if rec else None


def get_conversation_by_token(share_token: str) -> Optional[dict]:
    rec = _col("conversations").find_one({"share_token": share_token})
    return _conv_to_dict(rec) if rec else None


def list_conversations(user_id: str, media_id: Optional[str] = None, limit: int = 100) -> list[dict]:
    query: dict = {"user_id": user_id}
    if media_id:
        query["media_id"] = media_id
    rows = (
        _col("conversations")
        .find(query, {"_id": 0})
        .sort([("pinned", DESCENDING), ("updated_at", DESCENDING)])
        .limit(limit)
    )
    return [_conv_to_dict(r) for r in rows]


def append_messages(conv_id: str, messages: list[dict]) -> Optional[dict]:
    rec = _col("conversations").find_one({"conv_id": conv_id})
    if not rec:
        return None

    existing = rec.get("messages", [])
    existing.extend(messages)
    update: dict = {
        "messages":   existing,
        "updated_at": datetime.now(timezone.utc),
    }

    # Auto-title from first question
    if rec.get("title") == "New conversation" and messages:
        first_q       = messages[0].get("question", "")
        update["title"] = (first_q[:60] + "…") if len(first_q) > 60 else first_q

    _col("conversations").update_one({"conv_id": conv_id}, {"$set": update})
    return get_conversation(conv_id)


def rename_conversation(conv_id: str, title: str) -> Optional[dict]:
    result = _col("conversations").update_one(
        {"conv_id": conv_id},
        {"$set": {"title": title[:200], "updated_at": datetime.now(timezone.utc)}},
    )
    return get_conversation(conv_id) if result.matched_count else None


def pin_conversation(conv_id: str, pinned: bool) -> Optional[dict]:
    result = _col("conversations").update_one(
        {"conv_id": conv_id},
        {"$set": {"pinned": pinned, "updated_at": datetime.now(timezone.utc)}},
    )
    return get_conversation(conv_id) if result.matched_count else None


def delete_conversation(conv_id: str) -> bool:
    result = _col("conversations").delete_one({"conv_id": conv_id})
    return result.deleted_count > 0


def generate_share_token(conv_id: str) -> Optional[str]:
    rec = _col("conversations").find_one({"conv_id": conv_id})
    if not rec:
        return None
    token = rec.get("share_token") or secrets.token_urlsafe(32)
    _col("conversations").update_one({"conv_id": conv_id}, {"$set": {"share_token": token}})
    return token


def revoke_share_token(conv_id: str) -> bool:
    result = _col("conversations").update_one(
        {"conv_id": conv_id},
        {"$set": {"share_token": None}},
    )
    return result.matched_count > 0