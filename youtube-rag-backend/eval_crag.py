from __future__ import annotations

import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent)) 

from app.main import _build_docs          
from app.vectorstore import get_or_create_vectorstore
from app.rag import crag_retrieve

import re as _re
_YT_ID_RE = _re.compile(r"(?:v=|youtu\.be/|shorts/)([A-Za-z0-9_-]{11})")


def _normalize_media_id(raw: str) -> str:
    cleaned = raw.strip().strip("[],")
    m = _YT_ID_RE.search(cleaned)
    return m.group(1) if m else cleaned


def load_gold_set(path: str) -> list[dict]:
    raw = Path(path).read_bytes()
    if raw.startswith(b"\xff\xfe"):
        text = raw.decode("utf-16-le")
    elif raw.startswith(b"\xfe\xff"):
        text = raw.decode("utf-16-be")
    elif raw.startswith(b"\xef\xbb\xbf"):
        text = raw.decode("utf-8-sig")
    else:
        text = raw.decode("utf-8")

    data = json.loads(text)
    if not isinstance(data, list) or not data:
        raise ValueError("gold_set.json must be a non-empty JSON array.")
    return data


def run_eval(gold_set: list[dict]) -> dict:
    db_cache: dict[str, object] = {}
    results = []

    for item in gold_set:
        media_id = _normalize_media_id(item.get("media_id") or item.get("video_id"))
        question = item["question"]
        expect_keywords = [k.lower() for k in item.get("expect_keywords", [])]
        expect_confident = item.get("expect_confident")

        if media_id not in db_cache:
            db_cache[media_id] = get_or_create_vectorstore(media_id, docs_builder=_build_docs)
        db = db_cache[media_id]

        if db is None:
            results.append({
                "media_id": media_id, "question": question,
                "error": "no transcript/content available for this media_id",
                "hit": False, "relevance_score": 0.0, "corrected": False,
            })
            continue

        t0 = time.time()
        docs, crag_info = crag_retrieve(db, question, k=14)
        elapsed_ms = round((time.time() - t0) * 1000, 1)

        context = " ".join(d.page_content.lower() for d in docs)
        hit = any(kw in context for kw in expect_keywords) if expect_keywords else None

        confident_ok = (
            None if expect_confident is None
            else (crag_info["relevance_score"] >= 0.5) == expect_confident
        )

        results.append({
            "media_id":          media_id,
            "question":          question,
            "relevance_score":   crag_info["relevance_score"],
            "corrected":         crag_info["corrected"],
            "hit":               hit,
            "confident_ok":      confident_ok,
            "elapsed_ms":        elapsed_ms,
            "retrieved_preview": context[:160],
        })

    return _summarize(results)


def _summarize(results: list[dict]) -> dict:
    scored = [r for r in results if r.get("hit") is not None]
    n_hit = sum(1 for r in scored if r["hit"])

    conf_checked = [r for r in results if r.get("confident_ok") is not None]
    n_conf_ok = sum(1 for r in conf_checked if r["confident_ok"])

    corrected_count = sum(1 for r in results if r.get("corrected"))
    scores = [r["relevance_score"] for r in results if "relevance_score" in r]
    latencies = [r["elapsed_ms"] for r in results if "elapsed_ms" in r]

    summary = {
        "total_questions":          len(results),
        "keyword_hit_rate":         round(n_hit / len(scored), 3) if scored else None,
        "confidence_match_rate":    round(n_conf_ok / len(conf_checked), 3) if conf_checked else None,
        "avg_relevance_score":      round(sum(scores) / len(scores), 3) if scores else None,
        "corrective_retry_count":   corrected_count,
        "avg_retrieval_latency_ms": round(sum(latencies) / len(latencies), 1) if latencies else None,
    }
    return {"summary": summary, "results": results}


def print_report(report: dict):
    print("\n=== Per-question results ===")
    for r in report["results"]:
        flag = "PASS" if r.get("hit") else ("FAIL" if r.get("hit") is False else " -- ")
        corr = "corrected" if r.get("corrected") else ""
        print(f"[{flag}] score={r.get('relevance_score', 0):.2f}  {corr:9s}  {r.get('question', '')[:65]}")
        if r.get("error"):
            print(f"        ! {r['error']}")

    print("\n=== Summary ===")
    for k, v in report["summary"].items():
        print(f"  {k:28s}: {v}")


if __name__ == "__main__":
    gold_path = sys.argv[1] if len(sys.argv) > 1 else "gold_set.json"
    gold_set = load_gold_set(gold_path)
    report = run_eval(gold_set)
    print_report(report)

    out_path = Path("eval_report.json")
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(f"\nFull report written to {out_path.resolve()}")