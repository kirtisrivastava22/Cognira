import React, { useState, useRef, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

// Single-pass ref rendering: [para N] → teal button, [MM:SS] → amber button
const COMBINED_RE = /\[para(?:graph)?\s*(\d+)\]|\[(\d{1,2}):(\d{2})\]/gi;

function renderAnswer(raw) {
  const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(COMBINED_RE, (match, paraNum, mm, ss) => {
    if (paraNum !== undefined) {
      return `<button class="ref-para" data-para="${paraNum}">[para ${paraNum}]</button>`;
    }
    const sec = parseInt(mm, 10) * 60 + parseInt(ss, 10);
    return `<button class="ref-ts" data-time="${sec}">[${mm}:${ss}]</button>`;
  });
}

export default function AskQuestion({ videoData }) {
  const videoId    = videoData?.videoId    || "";
  const sourceType = videoData?.sourceType || "youtube";

  const [question,      setQuestion]      = useState("");
  const [status,        setStatus]        = useState("");
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState("");
  const [chat,          setChat]          = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentAnswer, chat]);

  const handleAsk = async () => {
    if (!question.trim()) { setError("Enter a question."); return; }
    setCurrentAnswer(""); setError(""); setIsLoading(true);
    setStatus("Searching content…");

    try {
      const res = await fetch(`${API}/ask_stream`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question, history: chat }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStatus("Generating answer…");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "", rawAnswer = "", askedQ = question;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop();

        for (const ev of events) {
          if (!ev.startsWith("data: ")) continue;
          const payload = JSON.parse(ev.slice(6));
          if (payload.type === "status")     setStatus(payload.value);
          if (payload.type === "token")     { rawAnswer += payload.value; setCurrentAnswer(rawAnswer); }
          if (payload.type === "correction") { rawAnswer = payload.value; setCurrentAnswer(rawAnswer); }
          if (payload.type === "end") {
            setChat(prev => [...prev, { question: askedQ, answer: rawAnswer }]);
            setCurrentAnswer(""); setQuestion(""); setStatus(""); setIsLoading(false);
          }
        }
      }
    } catch {
      setError("Could not reach backend. Make sure the server is running.");
      setIsLoading(false); setStatus("");
    }
  };

  const handleRefClick = (e) => {
    if (e.target.classList.contains("ref-ts")) {
      const sec = parseInt(e.target.dataset.time, 10);
      window.dispatchEvent(new CustomEvent("cognira:seek", { detail: { seconds: sec, videoId } }));
    }
    if (e.target.classList.contains("ref-para")) {
      const para = parseInt(e.target.dataset.para, 10);
      window.dispatchEvent(new CustomEvent("cognira:para", { detail: { paragraph: para, videoId } }));
    }
  };

  const handleExport = async () => {
    setStatus("Generating notes…");
    try {
      const res = await fetch(`${API}/export/docx?video_id=${videoId}`, { method: "POST" });
      if (!res.ok) throw new Error("Export failed");
      const blob = new Blob([await res.arrayBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url;
      const disp = res.headers.get("Content-Disposition") || "";
      a.download = disp.includes("filename=") ? disp.split("filename=")[1].replace(/"/g, "") : `${videoId}_notes.docx`;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch { setError("Export failed."); }
    finally  { setStatus(""); }
  };

  return (
    <div>
      {/* Source indicator */}
      <div className="flex items-center gap-8 mb-16">
        <span className={`tag ${sourceType === "docx" ? "tag-teal" : "tag-accent"}`}>
          {sourceType === "docx" ? "Document · paragraph refs" : sourceType === "youtube" ? "YouTube · timestamps" : "Upload · timestamps"}
        </span>
      </div>

      {/* Chat history */}
      {chat.map((item, idx) => (
        <div key={idx} className="answer-box">
          <div className="answer-q">Q: {item.question}</div>
          <div className="answer-text" dangerouslySetInnerHTML={{ __html: renderAnswer(item.answer) }} onClick={handleRefClick} />
        </div>
      ))}

      {/* Streaming answer */}
      {currentAnswer && (
        <div className="answer-box" style={{ borderColor: "var(--accent-border)" }}>
          <div className="answer-q">Answering…</div>
          <div className="answer-text" dangerouslySetInnerHTML={{ __html: renderAnswer(currentAnswer) }} onClick={handleRefClick} />
        </div>
      )}

      <div ref={bottomRef} />

      {/* Input */}
      <div className="mt-16">
        <textarea
          rows={3}
          placeholder={sourceType === "docx" ? "Ask about this document…" : "Ask anything about this content…"}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
          disabled={isLoading}
        />
      </div>

      <div className="flex gap-8 mt-12">
        <button className="btn btn-primary" onClick={handleAsk} disabled={isLoading}>
          {isLoading ? <><span className="spinner" /> Analyzing</> : "Ask"}
        </button>
        <button className="btn btn-secondary" onClick={handleExport} disabled={isLoading}>
          ↓ Export notes
        </button>
        {chat.length > 0 && (
          <button className="btn btn-ghost" onClick={() => setChat([])}>Clear</button>
        )}
      </div>

      {status && <div className="status-box status-loading mt-12"><span className="spinner" />{status}</div>}
      {error  && <div className="status-box status-error mt-12">⚠ {error}</div>}
    </div>
  );
}