import React, { useState } from "react";

const API = process.env.REACT_APP_API_URL || "/api";

// ── Groq system prompt for chapter detection ──────────────────────────────
const CHAPTER_SYSTEM = `You are analyzing a transcript or document to detect logical chapter boundaries.
Return ONLY valid JSON array — no markdown, no extra text.
Each chapter object:
{
  "title":      "Short chapter title (3–6 words)",
  "summary":    "One sentence describing this section.",
  "key_topics": ["topic1", "topic2"]
}
Do NOT invent start_time or timestamp — each section header already gives you its reference (e.g. [02:03] or [Para 6]); the caller re-attaches it after your response.`;

function buildChapterPrompt(buckets) {
  const sections = buckets.map((b, i) =>
    `Section ${i + 1} [${b.timestamp}]:\n${b.text.slice(0, 600)}`
  ).join("\n\n---\n\n");

  return `Analyze these transcript sections and return a JSON array of chapters, one per section, in the same order.
Each chapter should have: title (3-6 words), summary (1 sentence), key_topics (2-3 keywords).

${sections}

Return ONLY a JSON array like: [{"title":"...","summary":"...","key_topics":["...","..."]}]`;
}

// ── Bucket transcript docs into time windows (video/audio) ────────────────
function bucketDocsByTime(docs, windowSec = 240, maxChapters = 7) {
  if (!docs.length) return [];
  const sorted = [...docs].sort((a, b) => (a.metadata?.start || 0) - (b.metadata?.start || 0));

  const buckets = [];
  let currentTexts = [];
  let currentStart = sorted[0].metadata?.start || 0;
  let lastSplitTs  = currentStart;

  for (const doc of sorted) {
    const ts   = doc.metadata?.start || 0;
    const text = doc.page_content;
    const timeSince = ts - lastSplitTs;

    if ((timeSince >= windowSec || (timeSince >= 60 && hasTopicShift(text))) && currentTexts.length) {
      const mm = String(Math.floor(currentStart / 60)).padStart(2, "0");
      const ss = String(currentStart % 60).padStart(2, "0");
      buckets.push({ start_time: currentStart, timestamp: `${mm}:${ss}`, text: currentTexts.join(" ") });
      if (buckets.length >= maxChapters) break;
      currentTexts = [];
      currentStart = ts;
      lastSplitTs  = ts;
    }
    currentTexts.push(text);
  }

  if (currentTexts.length) {
    const mm = String(Math.floor(currentStart / 60)).padStart(2, "0");
    const ss = String(currentStart % 60).padStart(2, "0");
    buckets.push({ start_time: currentStart, timestamp: `${mm}:${ss}`, text: currentTexts.join(" ") });
  }

  return buckets;
}

// ── Bucket docx docs into paragraph windows (no real time axis) ───────────
function bucketDocsByParagraph(docs, parasPerChapter = 6, maxChapters = 7) {
  if (!docs.length) return [];
  const sorted = [...docs].sort((a, b) => (a.metadata?.paragraph ?? 0) - (b.metadata?.paragraph ?? 0));

  const buckets = [];
  let currentTexts = [];
  let currentStartPara = sorted[0].metadata?.paragraph ?? 0;
  let lastSplitPara = currentStartPara;

  for (const doc of sorted) {
    const para = doc.metadata?.paragraph ?? lastSplitPara;
    const text = doc.page_content;
    const parasSince = para - lastSplitPara;

    if ((parasSince >= parasPerChapter || (parasSince >= 2 && hasTopicShift(text))) && currentTexts.length) {
      buckets.push({ start_time: currentStartPara, timestamp: `Para ${currentStartPara}`, text: currentTexts.join(" ") });
      if (buckets.length >= maxChapters) break;
      currentTexts = [];
      currentStartPara = para;
      lastSplitPara = para;
    }
    currentTexts.push(text);
    lastSplitPara = para;
  }

  if (currentTexts.length) {
    buckets.push({ start_time: currentStartPara, timestamp: `Para ${currentStartPara}`, text: currentTexts.join(" ") });
  }

  return buckets;
}

const TOPIC_SHIFT = ["now let", "next", "moving on", "let's talk", "another", "finally",
  "in contrast", "let me show", "so what", "so how", "the problem", "the solution"];

function hasTopicShift(text) {
  return TOPIC_SHIFT.some(s => text.toLowerCase().includes(s));
}

// Dispatches to the right bucketing strategy based on the media's source type.
// docx docs never carry a real "start" — metadata.start on them is a synthetic
// paragraph_index * 10 value (see docx_reader.py), which bucketDocsByTime would
// happily format as MM:SS, producing exactly the wrong "timestamp" chapters
// you'd see for a document. Route docx through paragraph-based bucketing instead.
function bucketDocs(docs, sourceType, windowSec = 240, maxChapters = 7) {
  if (sourceType === "docx") {
    return bucketDocsByParagraph(docs, 6, maxChapters);
  }
  return bucketDocsByTime(docs, windowSec, maxChapters);
}

// ── Call Groq from browser ────────────────────────────────────────────────
async function detectChaptersWithGroq(docs, sourceType, groqKey) {
  const buckets = bucketDocs(docs, sourceType);
  if (!buckets.length) throw new Error("No transcript content to analyze.");

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      model:       "llama-3.1-8b-instant",
      temperature: 0,
      max_tokens:  1000,
      messages: [
        { role: "system", content: CHAPTER_SYSTEM },
        { role: "user",   content: buildChapterPrompt(buckets) },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Invalid Groq API key.");
    if (res.status === 429) throw new Error("Groq rate limit. Wait a moment.");
    throw new Error(err.error?.message || `Groq error ${res.status}`);
  }

  const data    = await res.json();
  const content = data.choices?.[0]?.message?.content || "[]";

  // Strip markdown fences if present
  const clean = content.replace(/```(?:json)?/g, "").trim();
  const start = clean.indexOf("[");
  const end   = clean.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("Could not parse chapters from Groq response.");

  const llmChapters = JSON.parse(clean.slice(start, end + 1));

  // Re-attach the deterministic start_time/timestamp from our own bucketing
  // instead of trusting whatever the LLM returned — the LLM only supplies
  // title/summary/key_topics now, so a bucket and chapter always line up
  // by index and a docx doc always gets "Para N", never a fabricated MM:SS.
  return llmChapters.map((ch, i) => ({
    title:      ch.title || `Part ${i + 1}`,
    start_time: buckets[i]?.start_time ?? 0,
    timestamp:  buckets[i]?.timestamp ?? "",
    summary:    ch.summary || "",
    key_topics: Array.isArray(ch.key_topics) ? ch.key_topics.slice(0, 3) : [],
  }));
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Chapters({ videoData, groqKey, onNeedKey }) {
  const videoId    = videoData?.videoId    || "";
  const sourceType = videoData?.sourceType || "youtube";

  const [chapters, setChapters] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [loaded,   setLoaded]   = useState(false);

  const load = async () => {
    const key = groqKey || localStorage.getItem("groq_api_key") || "";
    if (!key) { onNeedKey?.(); setError("Add your Groq API key to detect chapters."); return; }

    setLoading(true); setError("");
    try {
      // Step 1: Get transcript docs from backend (vectorstore)
      const res = await fetch(`${API}/retrieve`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question: "main topics and chapters", k: 40 }),
      });
      if (!res.ok) throw new Error("Could not load transcript from server.");
      const { docs } = await res.json();
      if (!docs?.length) throw new Error("No transcript content available for this video.");

      // Step 2: Detect chapters in browser via Groq
      const chapters = await detectChaptersWithGroq(docs, sourceType, key);
      if (!chapters.length) throw new Error("No chapters detected.");

      setChapters(chapters);
      setLoaded(true);
    } catch (e) {
      setError(e.message || "Failed to detect chapters.");
    } finally {
      setLoading(false);
    }
  };

  const jumpTo = (ch) => {
    if (sourceType === "docx") {
      window.dispatchEvent(new CustomEvent("cognira:para", { detail: { paragraph: ch.start_time } }));
    } else {
      window.dispatchEvent(new CustomEvent("cognira:seek", { detail: { seconds: ch.start_time, videoId } }));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-16">
        <div>
          <div className="heading" style={{ fontSize: 15 }}>Smart chapters</div>
          <div className="caption mt-4">AI-detected topic boundaries · runs in your browser</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={load} disabled={loading}>
          {loading ? <><span className="spinner" /> Detecting…</> : loaded ? "Refresh" : "Detect chapters"}
        </button>
      </div>

      {error && <div className="status-box status-error mb-16">⚠ {error}</div>}

      {loading && !chapters.length && (
        <div className="empty-state">
          <span className="spinner" style={{ width: 20, height: 20 }} />
          <span className="body">Analysing transcript structure…</span>
        </div>
      )}

      {chapters.length > 0 && (
        <div>
          {chapters.map((ch, idx) => (
            <div key={idx} className="chapter-item" onClick={() => jumpTo(ch)}>
              <span className="chapter-num">#{idx + 1}</span>
              <span className="chapter-time">{ch.timestamp}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="chapter-title-text">{ch.title}</div>
                {ch.summary && (
                  <div className="caption mt-4" style={{ overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {ch.summary}
                  </div>
                )}
                {ch.key_topics?.length > 0 && (
                  <div className="topic-tags">
                    {ch.key_topics.map((t, ti) => (
                      <span key={ti} className="tag tag-default" style={{ fontSize: 10.5 }}>{t}</span>
                    ))}
                  </div>
                )}
              </div>
              {sourceType !== "docx" && <span className="chapter-arrow">→</span>}
            </div>
          ))}
        </div>
      )}

      {!loading && !chapters.length && !error && (
        <div className="empty-state">
          <div className="empty-icon">⬡</div>
          <div className="empty-title">No chapters detected yet</div>
          <div className="empty-sub">Click the button above to segment this content into chapters.</div>
        </div>
      )}
    </div>
  );
}