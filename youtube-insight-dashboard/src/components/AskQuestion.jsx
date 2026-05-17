import React, { useState, useRef, useEffect } from "react";
import "./AskQuestion.css";

/* ─────────────────────────────────────────────────────────────────────────────
   AskQuestion — works for YouTube, uploaded audio/video, AND .docx uploads.

   Reference rendering:
     YouTube / audio  →  [mm:ss]  clickable — fires knowitfast:timestamp event
     DOCX             →  [para N] clickable — fires knowitfast:paragraph event

   FIX: Use a single-pass replacement to avoid double-processing HTML.
        Removed FLEX_TS_RE (bare MM:SS) — it caused false matches inside
        already-converted <button> HTML and on innocent numbers like "3:45".
   ───────────────────────────────────────────────────────────────────────────── */

const API = "http://127.0.0.1:8000";

// Combined single-pass regex — order matters: para first, then bracketed [MM:SS]
// Bare MM:SS (no brackets) is intentionally removed to avoid false positives.
const COMBINED_RE =
  /\[para(?:graph)?\s*(\d+)\]|\[(\d{1,2}):(\d{2})\]/gi;

function renderAnswer(raw) {
  // Escape any existing HTML so injected content is safe, then replace refs
  // We work on plain text → produce HTML in one pass (no risk of double-replace).
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped.replace(COMBINED_RE, (match, paraNum, mm, ss) => {
    if (paraNum !== undefined) {
      // [para N] or [paragraph N]
      return `<button class="ref-para" data-para="${paraNum}">[paragraph ${paraNum}]</button>`;
    }
    // [MM:SS]
    const sec = parseInt(mm, 10) * 60 + parseInt(ss, 10);
    return `<button class="ref-ts" data-time="${sec}">[${mm}:${ss}]</button>`;
  });
}

/* ─────────────────────────────────────────────────────────────────────────── */

const AskQuestion = ({ videoData }) => {
  const videoId    = videoData?.videoId    || "";
  const sourceType = videoData?.sourceType || "youtube";

  const [question,       setQuestion]       = useState("");
  const [status,         setStatus]         = useState("");
  const [isLoading,      setIsLoading]      = useState(false);
  const [error,          setError]          = useState("");
  const [chat,           setChat]           = useState([]);
  const [currentAnswer,  setCurrentAnswer]  = useState("");
  const answerRef = useRef(null);

  useEffect(() => {
    if (answerRef.current)
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
  }, [currentAnswer, chat]);

  /* ── Ask ──────────────────────────────────────────────────────────────── */
  const handleAsk = async () => {
    if (!question.trim()) { setError("Please enter a question."); return; }

    setCurrentAnswer(""); setError(""); setIsLoading(true);
    setStatus("Analyzing content…");

    try {
      const res = await fetch(`${API}/ask_stream`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id: videoId,
          question,
          history: chat,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStatus("Generating answer…");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let rawAnswer = "";
      const askedQuestion = question;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop();

        for (const ev of events) {
          if (!ev.startsWith("data: ")) continue;
          const payload = JSON.parse(ev.slice(6));

          switch (payload.type) {
            case "status":
              setStatus(payload.value);
              break;
            case "token":
              rawAnswer += payload.value;
              setCurrentAnswer(rawAnswer);
              break;
            case "correction":
              rawAnswer = payload.value;
              setCurrentAnswer(rawAnswer);
              break;
            case "end":
              setChat(prev => [
                ...prev,
                { question: askedQuestion, answer: rawAnswer },
              ]);
              setCurrentAnswer("");
              setQuestion("");
              setStatus("");
              setIsLoading(false);
              break;
            default:
              break;
          }
        }
      }
    } catch (err) {
      setError("Failed to connect to backend. Make sure the server is running.");
      setIsLoading(false);
      setStatus("");
    }
  };

  /* ── Reference click handler ─────────────────────────────────────────── */
  const handleAnswerClick = (e) => {
    // Timestamp click → seek video / audio
    if (e.target.classList.contains("ref-ts")) {
      const sec = parseInt(e.target.dataset.time, 10);
      window.dispatchEvent(
        new CustomEvent("knowitfast:timestamp", {
          detail: { seconds: sec, videoId },
        })
      );
      return;
    }

    // Paragraph click (DOCX) → scroll to paragraph
    if (e.target.classList.contains("ref-para")) {
      const para = parseInt(e.target.dataset.para, 10);
      window.dispatchEvent(
        new CustomEvent("knowitfast:paragraph", { detail: { paragraph: para, videoId } })
      );
    }
  };

  /* ── Export DOCX ─────────────────────────────────────────────────────── */
  const handleExportDOCX = async () => {
    setStatus("Generating DOCX…");
    try {
      const res = await fetch(`${API}/export/docx?video_id=${videoId}`, { method: "POST" });
      if (!res.ok) throw new Error("Export failed");

      const blob = new Blob([await res.arrayBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url;

      const disposition = res.headers.get("Content-Disposition") || "";
      a.download = disposition.includes("filename=")
        ? disposition.split("filename=")[1].replace(/"/g, "")
        : `${videoId}_notes.docx`;

      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err) {
      setError("Failed to export DOCX.");
    } finally {
      setStatus("");
    }
  };

  return (
    <div className="glass-card pad-lg">
      {/* Header chips */}
      <div className="card-row" style={{ marginBottom: 16 }}>
        <div className="chip">Ask AI</div>
        <div className="chip">
          {sourceType === "youtube"
            ? "YouTube · timestamps"
            : sourceType === "docx"
            ? "Word Doc · paragraph refs"
            : "Uploaded media · timestamps"}
        </div>
      </div>

      {/* Question input */}
      <div className="input-group">
        <label htmlFor="q-input" className="section-title" style={{ display: "block" }}>
          Your Question
        </label>
        <textarea
          id="q-input"
          className="textarea-field"
          rows={4}
          placeholder={
            sourceType === "docx"
              ? "Ask anything about this document…"
              : "What is this content about? Ask anything…"
          }
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); }
          }}
          disabled={isLoading}
        />
      </div>

      {/* Actions */}
      <div className="hero-actions" style={{ marginTop: 14 }}>
        <button className="btn-primary" onClick={handleAsk} disabled={isLoading}>
          {isLoading
            ? <><span className="spinner" style={{ marginRight: 8 }} />Analyzing…</>
            : "Ask Question"}
        </button>
        <button className="btn-secondary" onClick={handleExportDOCX} disabled={isLoading}>
          📥 Export notes as DOCX
        </button>
      </div>

      {/* Status / Error */}
      {status && (
        <div className="status-box loading">
          <span className="spinner" /> <span>{status}</span>
        </div>
      )}
      {error && (
        <div className="status-box error">⚠️ <span>{error}</span></div>
      )}

      {/* Answer history + streaming answer */}
      <div ref={answerRef} style={{ marginTop: 16 }}>
        {chat.map((item, idx) => (
          <div key={idx} className="answer-box" style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Q: {item.question}</div>
            <div
              className="answer-content"
              dangerouslySetInnerHTML={{ __html: renderAnswer(item.answer) }}
              onClick={handleAnswerClick}
            />
          </div>
        ))}

        {currentAnswer && (
          <div className="answer-box">
            <div style={{ fontWeight: 600 }}>Answer</div>
            <div
              className="answer-content"
              dangerouslySetInnerHTML={{ __html: renderAnswer(currentAnswer) }}
              onClick={handleAnswerClick}
            />
          </div>
        )}
      </div>

      {/* Inline styles for ref buttons */}
      <style>{`
        .ref-ts,
        .ref-para {
          display: inline;
          background: rgba(124, 58, 237, 0.18);
          border: 1px solid rgba(124, 58, 237, 0.4);
          color: #c4b5fd;
          border-radius: 4px;
          padding: 1px 6px;
          font-size: 0.78em;
          font-weight: 600;
          font-family: 'SF Mono', 'Fira Code', monospace;
          cursor: pointer;
          line-height: 1.6;
          vertical-align: baseline;
          transition: background 0.15s, border-color 0.15s, transform 0.1s;
        }
        .ref-ts:hover,
        .ref-para:hover {
          background: rgba(124, 58, 237, 0.35);
          border-color: rgba(167, 139, 250, 0.7);
          transform: translateY(-1px);
        }
        .ref-ts:active,
        .ref-para:active {
          transform: translateY(0);
        }
        .ref-para {
          background: rgba(37, 99, 235, 0.18);
          border-color: rgba(96, 165, 250, 0.4);
          color: #93c5fd;
        }
        .ref-para:hover {
          background: rgba(37, 99, 235, 0.32);
          border-color: rgba(147, 197, 253, 0.7);
        }
      `}</style>
    </div>
  );
};

export default AskQuestion;