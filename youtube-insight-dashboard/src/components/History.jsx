import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const groupByDate = (videos) => {
  const groups = { today: [], yesterday: [], thisWeek: [], older: [] };
  const now       = new Date();
  const today     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);

  videos.forEach(video => {
    const date = new Date(video.viewed_at || video.timestamp);
    const day  = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if      (day.getTime() === today.getTime())     groups.today.push(video);
    else if (day.getTime() === yesterday.getTime()) groups.yesterday.push(video);
    else if (date >= weekAgo)                       groups.thisWeek.push(video);
    else                                            groups.older.push(video);
  });
  return groups;
};

const formatTitle = key => ({ today: "Today", yesterday: "Yesterday", thisWeek: "This Week", older: "Older" }[key] || key);

export default function History({ videoHistory, setCurrentVideo }) {
  const navigate   = useNavigate();
  const [search, setSearch] = useState("");

  const filtered = videoHistory.filter(v => (v.title || "").toLowerCase().includes(search.toLowerCase()));
  const grouped  = groupByDate(filtered);

  const open = video => { setCurrentVideo(video); navigate("/analyze"); };

  const clearHistory = () => {
    if (window.confirm("Clear all history?")) {
      localStorage.removeItem("cognira_history_guest");
      window.location.reload();
    }
  };

  return (
    <div className="page-grid">
      {/* Header */}
      <div className="card card-accent">
        <div className="subheading mb-8">All sessions</div>
        <h1 className="display" style={{ fontSize: "clamp(22px,4vw,32px)", marginBottom: 8 }}>Your History</h1>
        <p className="body">Search and revisit every video, audio file, and document you've analyzed.</p>
      </div>

      {/* Controls */}
      <div className="card card-sm">
        <div className="history-controls">
          <input
            type="text"
            className="search-bar"
            placeholder="Search sessions…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          {videoHistory.length > 0 && (
            <button className="btn btn-danger btn-sm" onClick={clearHistory}>
              🗑 Clear all
            </button>
          )}
        </div>
      </div>

      {/* Empty states */}
      {videoHistory.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">◷</div>
            <div className="empty-title">No history yet</div>
            <div className="empty-sub">Sessions you analyze will appear here.</div>
            <button className="btn btn-primary mt-8" onClick={() => navigate("/analyze")}>
              Analyze your first session
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">⌕</div>
            <div className="empty-title">No results</div>
            <div className="empty-sub">Try a different search term.</div>
          </div>
        </div>
      ) : (
        Object.entries(grouped).map(([key, videos]) =>
          videos.length === 0 ? null : (
            <div key={key} className="card">
              <div className="subheading mb-16">{formatTitle(key)}</div>
              <div className="history-grid">
                {videos.map(video => (
                  <VideoCard key={video.media_id || video.videoId} video={video} onClick={() => open(video)} />
                ))}
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}

function VideoCard({ video, onClick }) {
  const isYoutube = video.source_type === "youtube" || !video.source_type;
  return (
    <div className="history-video-card" onClick={onClick}>
      <div className="video-thumbnail">
        {isYoutube ? (
          <img src={`https://img.youtube.com/vi/${video.media_id}/mqdefault.jpg`} alt={video.title} loading="lazy" />
        ) : (
          <div className="video-fallback">
            {video.source_type === "upload" ? "📁" : "📄"}
          </div>
        )}
        <div className="video-overlay"><span className="play-icon">▶</span></div>
      </div>
      <div className="video-info">
        <div className="video-title">{video.title || "Untitled"}</div>
        <div className="video-date">{new Date(video.viewed_at || video.timestamp).toLocaleDateString()}</div>
      </div>
    </div>
  );
}