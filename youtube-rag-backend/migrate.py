import sys
import sqlite3
from pathlib import Path

DB_PATH = Path(sys.argv[sys.argv.index("--db") + 1]) if "--db" in sys.argv else Path("cognira.db")

if not DB_PATH.exists():
    print(f"[migrate] DB not found at {DB_PATH} — nothing to do.")
    sys.exit(0)

print(f"[migrate] Upgrading {DB_PATH.resolve()} …")

conn = sqlite3.connect(str(DB_PATH))
cur  = conn.cursor()

# ── Helper ────────────────────────────────────────────────────────────────────

def add_column(table: str, column: str, definition: str):
    try:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
        print(f"  + {table}.{column}")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print(f"  ✓ {table}.{column} already exists")
        else:
            raise


# ── users table — add v4 security columns ────────────────────────────────────

add_column("users", "password_hash",   "TEXT")
add_column("users", "failed_attempts", "INTEGER DEFAULT 0")
add_column("users", "locked_until",    "DATETIME")

# Widen user_id to 64 chars — SQLite ignores column type widths so this is
# just documentation; existing rows are unaffected.
print("  ✓ users.user_id width is advisory in SQLite — no action needed")

# ── sessions table — create if missing ───────────────────────────────────────

cur.execute("""
CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    created_at  DATETIME DEFAULT (datetime('now')),
    expires_at  DATETIME NOT NULL,
    revoked     INTEGER DEFAULT 0
)
""")
cur.execute("CREATE INDEX IF NOT EXISTS ix_sessions_user_id ON sessions(user_id)")
print("  ✓ sessions table ready")

# ── history table — widen user_id column (advisory) ──────────────────────────
print("  ✓ history.user_id width is advisory in SQLite — no action needed")

# ── conversations table — same ────────────────────────────────────────────────
print("  ✓ conversations.user_id width is advisory in SQLite — no action needed")

conn.commit()
conn.close()

print(f"\n[migrate] Done. Restart the API server now.")