import React, { useState } from "react";

const API = process.env.VITE_API_URL;

export default function Chapters({ videoData }) {
  const videoId    = videoData?.videoId    || "";
  const sourceType = videoData?.sourceType || "youtube";

  const [chapters, setChapters] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [loaded,   setLoaded]   = useState(false);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${API}/chapters/${videoId}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setChapters(data.chapters || []);
      setLoaded(true);
    } catch {
      setError("Failed to load chapters. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const seek = (startTime) => {
    window.dispatchEvent(new CustomEvent("cognira:seek", { detail: { seconds: startTime, videoId } }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-16">
        <div>
          <div className="heading" style={{ fontSize: 15 }}>Smart chapters</div>
          <div className="caption mt-4">AI-detected topic boundaries</div>
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
            <div
              key={idx}
              className="chapter-item"
              onClick={() => seek(ch.start_time)}
            >
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