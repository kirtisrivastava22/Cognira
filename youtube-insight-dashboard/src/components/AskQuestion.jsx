import React, { useState, useRef, useEffect } from "react";
import "./AskQuestion.css";

/* ─────────────────────────────────────────────────────────────────────────────
   AskQuestion — works for YouTube, uploaded audio/video, AND .docx uploads.

   Reference rendering:
     YouTube / audio  →  [mm:ss]  clickable — opens YouTube at timestamp
                                              or fires knowitfast:timestamp event
     DOCX             →  [para N] clickable — fires knowitfast:paragraph event
                                              (host can scroll to paragraph)

   Both reference types are rendered as <button> elements in the answer HTML
   so they are keyboard-accessible.
   ───────────────────────────────────────────────────────────────────────────── */

const API = "http://127.0.0.1:8000";

/* Regex patterns */
const TS_RE   = /\[(\d{2}):(\d{2})\]/g;          // [04:55]
const PARA_RE = /\[para(?:graph)?\s*(\d+)\]/gi;   // [para 3] or [paragraph 3]

function renderAnswer(raw, sourceType) {
  // Replace timestamp refs
  let html = raw.replace(TS_RE, (match, mm, ss) => {
    const sec = parseInt(mm, 10) * 60 + parseInt(ss, 10);
    return `<button class="ref-ts" data-time="${sec}" title="Jump to ${match}">${match}</button>`;
  });

  // Replace para refs (DOCX)
  html = html.replace(PARA_RE, (match, n) => {
    return `<button class="ref-para" data-para="${n}" title="Go to paragraph ${n}">${match}</button>`;
  });

  return html;
}

/* ─────────────────────────────────────────────────────────────────────────── */

const AskQuestion = ({ videoData }) => {
  const videoId    = videoData?.videoId    || "";
  const sourceType = videoData?.sourceType || "youtube";

  const [question, setQuestion] = useState("");
  const [answerHtml, setAnswerHtml] = useState("");
  const [status,   setStatus]   = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error,    setError]    = useState("");
  const answerRef  = useRef(null);

  useEffect(() => {
    if (answerRef.current)
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
  }, [answerHtml]);

  /* ── Ask ──────────────────────────────────────────────────────────────── */
  const handleAsk = async () => {
    if (!question.trim()) { setError("Please enter a question."); return; }

    setAnswerHtml(""); setError(""); setIsLoading(true);
    setStatus("Analyzing content…");

    try {
      const res = await fetch(`${API}/ask_stream`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ video_id: videoId, question }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStatus("Generating answer…");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "";
      let rawAnswer = "";

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
              setAnswerHtml(renderAnswer(rawAnswer, sourceType));
              break;
            case "correction":
              rawAnswer = payload.value;
              setAnswerHtml(renderAnswer(rawAnswer, sourceType));
              break;
            case "end":
              setStatus(""); setIsLoading(false);
              break;
            default:
              break;
          }
        }
      }
    } catch (err) {
      setError("Failed to connect to backend. Make sure the server is running.");
      setIsLoading(false); setStatus("");
    }
  };

  /* ── Reference click handler ─────────────────────────────────────────── */
  const handleAnswerClick = (e) => {
    // Timestamp click
    if (e.target.classList.contains("ref-ts")) {
      const sec = parseInt(e.target.dataset.time, 10);
      if (sourceType === "youtube") {
        window.open(`https://www.youtube.com/watch?v=${videoId}&t=${sec}s`, "_blank");
      } else {
        window.dispatchEvent(
          new CustomEvent("knowitfast:timestamp", { detail: { seconds: sec, videoId } })
        );
      }
      return;
    }

    // Paragraph click (DOCX)
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
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
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

  const refLabel = sourceType === "docx" ? "paragraph refs" : "timestamps";

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
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
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

      {/* Status */}
      {status && (
        <div className="status-box loading">
          <span className="spinner" /> <span>{status}</span>
        </div>
      )}
      {error && (
        <div className="status-box error">⚠️ <span>{error}</span></div>
      )}

      {/* Answer */}
      {answerHtml && (
        <div className="answer-box" style={{ marginTop: 16 }}>
          <div className="answer-header">
            <span className="section-title" style={{ margin: 0 }}>Answer</span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
              Click {refLabel} to jump
            </span>
          </div>
          <div
            ref={answerRef}
            className="answer-content"
            dangerouslySetInnerHTML={{ __html: answerHtml }}
            onClick={handleAnswerClick}
          />
        </div>
      )}

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