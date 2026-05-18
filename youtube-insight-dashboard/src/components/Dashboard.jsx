import React from "react";
import { useNavigate } from "react-router-dom";

const FEATURES = [
  { icon: "◈", title: "Ask anything",    body: "Timestamped answers from any video, audio, or document." },
  { icon: "⬡", title: "Smart chapters",  body: "AI detects natural topic shifts and names each section." },
  { icon: "⊞", title: "Instant quiz",    body: "Multiple-choice questions generated from the actual content." },
  { icon: "↓", title: "Export notes",    body: "Download polished DOCX study notes in one click." },
  { icon: "⌕", title: "Doc search",      body: "Full-text search with paragraph-level navigation." },
  { icon: "◷", title: "Seek & jump",     body: "Click any reference to jump to that exact moment or passage." },
];

export default function Dashboard({ videoHistory, setCurrentVideo, user, onOpenAuth }) {
  const navigate   = useNavigate();
  const recent     = videoHistory.slice(0, 6);

  const open = (video) => {
    setCurrentVideo(video);
    navigate("/analyze");
  };

  return (
    <div className="page-grid">
      {/* Hero */}
      <div className="card card-accent">
        <div style={{ marginBottom: 20 }}>
          <span className="tag tag-accent" style={{ marginBottom: 14, display: "inline-flex" }}>
            {user ? `Synced · ${user.name}` : "Guest mode"}
          </span>
          <h1 className="display" style={{ marginBottom: 12 }}>
            Turn any content<br />
            <em style={{ fontStyle: "italic", color: "var(--accent)" }}>into clarity.</em>
          </h1>
          <p className="body" style={{ maxWidth: 500 }}>
            Paste a YouTube URL, upload audio or video, or drop a Word document.
            Cognira builds transcript intelligence and gives you instant answers, chapters, quizzes, and exportable notes.
          </p>
        </div>

        <div className="flex gap-10 flex-wrap">
          <button className="btn btn-primary btn-lg" onClick={() => navigate("/analyze")}>
            Start analyzing
          </button>
          {!user && (
            <button className="btn btn-secondary" onClick={onOpenAuth}>
              Sign in to sync history
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-12" style={{ flexWrap: "wrap" }}>
        {[
          { value: videoHistory.length, label: user ? "Sessions synced" : "Sessions (local)" },
          { value: "Streaming", label: "Real-time answers" },
          { value: "3-in-1",    label: "Ask · Chapters · Quiz" },
        ].map((s, i) => (
          <div key={i} className="card card-sm" style={{ flex: "1 1 130px" }}>
            <div className="display-sm" style={{ fontSize: 22, color: "var(--accent)" }}>{s.value}</div>
            <div className="caption mt-4">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Recent sessions */}
      {recent.length > 0 && (
        <div className="card">
          <div className="section-header">
            <div className="subheading">Recent sessions</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/history")}>View all →</button>
          </div>
          <div className="history-grid">
            {recent.map((v, i) => (
              <HistoryCard key={i} video={v} onClick={() => open(v)} />
            ))}
          </div>
        </div>
      )}

      {/* Features grid */}
      <div className="card">
        <div className="subheading mb-16">What you can do</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{
              padding: "16px 18px", borderRadius: "var(--radius)", border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
            }}>
              <div style={{ fontSize: 20, marginBottom: 8, color: "var(--accent)" }}>{f.icon}</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-primary)", marginBottom: 5 }}>{f.title}</div>
              <div className="caption" style={{ lineHeight: 1.6 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryCard({ video, onClick }) {
  const isYoutube  = (video.sourceType || video.source_type) === "youtube" || (!video.sourceType && !video.source_type);
  const mediaId    = video.videoId || video.media_id;
  const srcType    = video.sourceType || video.source_type;
  const date       = video.viewed_at || video.timestamp;

  return (
    <div className="history-card" onClick={onClick}>
      <div className="history-thumb">
        {isYoutube ? (
          <img src={`https://img.youtube.com/vi/${mediaId}/mqdefault.jpg`} alt={video.title} />
        ) : (
          srcType === "docx" ? "📄" : "🎬"
        )}
      </div>
      <div className="history-info">
        <div className="history-title">{video.title || "Untitled"}</div>
        <div className="history-date">{date ? new Date(date).toLocaleDateString() : ""}</div>
      </div>
    </div>
  );
}