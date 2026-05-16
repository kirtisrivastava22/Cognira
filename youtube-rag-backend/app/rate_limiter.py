"""
rate_limiter.py
---------------
Lightweight in-process rate limiter using a sliding-window counter.

Suitable for single-process deployments (one Uvicorn worker).
For multi-worker / multi-instance, swap the store with Redis.

Limits (configurable via env vars or defaults):
  ASK_STREAM  : 30 req / 60 s  per IP
  INGEST      : 10 req / 60 s  per IP
  EXPORT      : 5  req / 60 s  per IP
  QUIZ        :  10 req / 60 s  per IP
  CHAPTERS    : 10 req / 60 s  per IP
  GLOBAL      : 100 req / 60 s per IP  (catch-all)
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from threading import Lock
from typing import Optional

from fastapi import HTTPException, Request


# ─────────────────────────────────────────────────────────────────────────────
# Sliding-window store
# ─────────────────────────────────────────────────────────────────────────────

class SlidingWindow:
    """Thread-safe sliding-window counter per key."""

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._store: dict[str, deque] = defaultdict(deque)
        self._lock = Lock()

    def is_allowed(self, key: str) -> tuple[bool, int]:
        """
        Returns (allowed, retry_after_seconds).
        retry_after is 0 when allowed.
        """
        now = time.time()
        cutoff = now - self.window_seconds

        with self._lock:
            q = self._store[key]

            # Drop timestamps outside the window
            while q and q[0] <= cutoff:
                q.popleft()

            if len(q) >= self.max_requests:
                retry_after = int(self.window_seconds - (now - q[0])) + 1
                return False, max(1, retry_after)

            q.append(now)
            return True, 0

    def reset(self, key: str):
        with self._lock:
            self._store.pop(key, None)


# ─────────────────────────────────────────────────────────────────────────────
# Named limiters
# ─────────────────────────────────────────────────────────────────────────────

def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (ValueError, TypeError):
        return default


LIMITERS: dict[str, SlidingWindow] = {
    "ask_stream": SlidingWindow(
        _env_int("RL_ASK_STREAM_MAX", 30),
        _env_int("RL_ASK_STREAM_WINDOW", 60),
    ),
    "ingest": SlidingWindow(
        _env_int("RL_INGEST_MAX", 10),
        _env_int("RL_INGEST_WINDOW", 60),
    ),
    "export": SlidingWindow(
        _env_int("RL_EXPORT_MAX", 5),
        _env_int("RL_EXPORT_WINDOW", 60),
    ),
    "quiz": SlidingWindow(
        _env_int("RL_QUIZ_MAX", 10),
        _env_int("RL_QUIZ_WINDOW", 60),
    ),
    "chapters": SlidingWindow(
        _env_int("RL_CHAPTERS_MAX", 10),
        _env_int("RL_CHAPTERS_WINDOW", 60),
    ),
    "global": SlidingWindow(
        _env_int("RL_GLOBAL_MAX", 100),
        _env_int("RL_GLOBAL_WINDOW", 60),
    ),
}


# ─────────────────────────────────────────────────────────────────────────────
# IP extraction
# ─────────────────────────────────────────────────────────────────────────────

def _get_ip(request: Request) -> str:
    """
    Prefer X-Forwarded-For (set by reverse proxies like Nginx/Caddy).
    Falls back to direct client host.
    """
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI dependency factory
# ─────────────────────────────────────────────────────────────────────────────

def rate_limit(limiter_name: str):
    """
    Returns a FastAPI dependency that enforces the named limiter.

    Usage:
        @app.post("/ask_stream", dependencies=[Depends(rate_limit("ask_stream"))])
    """
    limiter = LIMITERS.get(limiter_name, LIMITERS["global"])

    async def _check(request: Request):
        ip = _get_ip(request)

        # Per-route check
        allowed, retry_after = limiter.is_allowed(ip)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Retry after {retry_after}s.",
                headers={"Retry-After": str(retry_after)},
            )

        # Global check
        g_allowed, g_retry = LIMITERS["global"].is_allowed(ip)
        if not g_allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Global rate limit exceeded. Retry after {g_retry}s.",
                headers={"Retry-After": str(g_retry)},
            )

    return _check