"""
Reads an uploaded .docx file and converts it to LangChain Documents.

Design goals:
  - Word-limit enforcement: hard cap at MAX_WORDS (configurable, default 20 000)
    so a 500-page book cannot blow the vectorstore / LLM token budget.
  - Paragraph-level chunking: each non-empty paragraph becomes one Document,
    carrying a synthetic "start" metadata key (paragraph index × 10) so that
    all downstream code (chapters, quiz, rag) works without changes.
  - Table support: table cell text is concatenated into one paragraph Document.
  - Clean text: removes control characters and normalises whitespace.
  - No transcript required: the file itself is the knowledge source.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Optional

from docx import Document as DocxDocument          # python-docx
from langchain_core.documents import Document


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

MAX_WORDS: int = 20_000      # hard cap — roughly ~30 pages of dense text
MIN_PARA_CHARS: int = 20     # skip headings / decorative lines shorter than this


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    """Remove control characters, collapse whitespace."""
    text = re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", text)
    return re.sub(r"\s+", " ", text).strip()


def _word_count(text: str) -> int:
    return len(text.split())


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

class WordLimitExceeded(Exception):
    """Raised when the document exceeds MAX_WORDS before truncation."""


def load_docx_docs(
    file_path: str | Path,
    max_words: int = MAX_WORDS,
    truncate: bool = True,          # True = silently truncate; False = raise
) -> tuple[list[Document], dict]:
    """
    Parse a .docx file into LangChain Documents.

    Parameters
    ----------
    file_path : path to the .docx file on disk
    max_words : word cap (default 20 000)
    truncate  : if True, stop adding paragraphs when cap is reached;
                if False, raise WordLimitExceeded

    Returns
    -------
    (docs, meta) where meta = {word_count, paragraph_count, truncated}
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"DOCX not found: {path}")

    docx = DocxDocument(str(path))
    raw_paragraphs: list[str] = []

    # ── Body paragraphs ──────────────────────────────────────────────────────
    for para in docx.paragraphs:
        text = _clean(para.text)
        if len(text) >= MIN_PARA_CHARS:
            raw_paragraphs.append(text)

    # ── Tables ───────────────────────────────────────────────────────────────
    for table in docx.tables:
        for row in table.rows:
            cells = [_clean(c.text) for c in row.cells if _clean(c.text)]
            if cells:
                raw_paragraphs.append("  |  ".join(cells))

    # ── Build Documents with word-limit enforcement ──────────────────────────
    docs: list[Document] = []
    total_words = 0
    truncated = False

    for i, text in enumerate(raw_paragraphs):
        wc = _word_count(text)

        if total_words + wc > max_words:
            if not truncate:
                raise WordLimitExceeded(
                    f"Document exceeds the {max_words:,}-word limit "
                    f"(reached at paragraph {i + 1})."
                )
            # Partial paragraph: include as many words as budget allows
            remaining = max_words - total_words
            if remaining > 10:
                text = " ".join(text.split()[:remaining])
                docs.append(Document(
                    page_content=text,
                    metadata={"start": i * 10, "source": "docx", "paragraph": i},
                ))
            truncated = True
            break

        docs.append(Document(
            page_content=text,
            metadata={
                "start": i * 10,
                "source": "docx",
                "paragraph": i,
                "page": i // 5   # approx (tune this)
            },
        ))
        total_words += wc

    meta = {
        "word_count":      total_words,
        "paragraph_count": len(docs),
        "truncated":       truncated,
        "max_words":       max_words,
    }

    return docs, meta