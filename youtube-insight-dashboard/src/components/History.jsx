import React, { useState, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

// ── Date grouping ─────────────────────────────────────────────────────────
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

const GROUP_LABELS = { today: "Today", yesterday: "Yesterday", thisWeek: "This Week", older: "Older" };

const SOURCE_META = {
  youtube: { icon: "▶", label: "YouTube",  color: "var(--accent)" },
  upload:  { icon: "📁", label: "Upload",   color: "var(--teal)"   },
  docx:    { icon: "📄", label: "Document", color: "#a78bfa"       },
};

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000);
  if (diff < 60)     return "just now";
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Animated counter ──────────────────────────────────────────────────────
function Counter({ to, duration = 600 }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (to === 0) return;
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const pct = Math.min((ts - start) / duration, 1);
      setVal(Math.floor(pct * to));
      if (pct < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [to, duration]);
  return <>{val}</>;
}

// ── Video card ────────────────────────────────────────────────────────────
function VideoCard({ video, onClick, index }) {
  const src   = video.source_type || "youtube";
  const meta  = SOURCE_META[src] || SOURCE_META.youtube;
  const isYT  = src === "youtube";
  const thumb = isYT
    ? `https://img.youtube.com/vi/${video.media_id}/mqdefault.jpg`
    : null;

  return (
    <div
      className="history-card"
      onClick={onClick}
      style={{ "--i": index }}
    >
      {/* Thumbnail */}
      <div className="history-card-thumb">
        {thumb ? (
          <img src={thumb} alt={video.title} loading="lazy" />
        ) : (
          <div className="history-card-fallback">
            <span style={{ fontSize: 28 }}>{meta.icon}</span>
          </div>
        )}
        <div className="history-card-overlay">
          <div className="history-card-play">▶</div>
        </div>
        {/* Source badge */}
        <div className="history-card-badge" style={{ "--badge-color": meta.color }}>
          {meta.label}
        </div>
      </div>

      {/* Info */}
      <div className="history-card-body">
        <div className="history-card-title">{video.title || "Untitled"}</div>
        <div className="history-card-meta">
          <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>
            {formatRelativeTime(video.viewed_at || video.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── List row (for list view) ──────────────────────────────────────────────
function VideoRow({ video, onClick, index }) {
  const src  = video.source_type || "youtube";
  const meta = SOURCE_META[src] || SOURCE_META.youtube;
  const isYT = src === "youtube";
  const thumb = isYT
    ? `https://img.youtube.com/vi/${video.media_id}/mqdefault.jpg`
    : null;

  return (
    <div className="history-row" onClick={onClick} style={{ "--i": index }}>
      <div className="history-row-thumb">
        {thumb ? (
          <img src={thumb} alt={video.title} loading="lazy" />
        ) : (
          <div className="history-card-fallback" style={{ height: "100%" }}>
            <span style={{ fontSize: 18 }}>{meta.icon}</span>
          </div>
        )}
        <div className="history-card-overlay" style={{ borderRadius: 6 }}>
          <span style={{ fontSize: 14 }}>▶</span>
        </div>
      </div>
      <div className="history-row-info">
        <div className="history-card-title" style={{ fontSize: 13.5, marginBottom: 4 }}>
          {video.title || "Untitled"}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="tag" style={{
            fontSize: 10, padding: "1px 7px",
            background: "var(--bg-elevated)",
            color: meta.color,
            border: `1px solid ${meta.color}33`,
          }}>
            {meta.label}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
            {formatRelativeTime(video.viewed_at || video.timestamp)}
          </span>
        </div>
      </div>
      <span className="history-row-arrow">→</span>
    </div>
  );
}

// ── Stats bar ─────────────────────────────────────────────────────────────
function StatsBar({ videos }) {
  const counts = useMemo(() => {
    const c = { youtube: 0, upload: 0, docx: 0 };
    videos.forEach(v => { const t = v.source_type || "youtube"; if (c[t] !== undefined) c[t]++; });
    return c;
  }, [videos]);

  const stats = [
    { label: "Total sessions", value: videos.length, color: "var(--accent)" },
    { label: "YouTube videos",  value: counts.youtube, color: "var(--accent)"  },
    { label: "Uploaded files",  value: counts.upload,  color: "var(--teal)"    },
    { label: "Documents",       value: counts.docx,    color: "#a78bfa"        },
  ];

  return (
    <div className="history-stats">
      {stats.map(s => (
        <div key={s.label} className="history-stat">
          <div className="history-stat-value" style={{ color: s.color }}>
            <Counter to={s.value} />
          </div>
          <div className="history-stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function History({ videoHistory, setCurrentVideo, user }) {
  const navigate          = useNavigate();
  const [search,   setSearch]   = useState("");
  const [view,     setView]     = useState("grid"); // "grid" | "list"
  const [sortBy,   setSortBy]   = useState("date"); // "date" | "title" | "type"
  const searchRef = useRef(null);

  // Focus search on "/" key
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const sorted = useMemo(() => {
    const filtered = videoHistory.filter(v =>
      (v.title || "").toLowerCase().includes(search.toLowerCase())
    );
    if (sortBy === "title") return [...filtered].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    if (sortBy === "type")  return [...filtered].sort((a, b) => (a.source_type || "").localeCompare(b.source_type || ""));
    return filtered; // "date" — already sorted by viewed_at from backend
  }, [videoHistory, search, sortBy]);

  const grouped = useMemo(() => groupByDate(sorted), [sorted]);

  const open = (video) => {
    setCurrentVideo({
      videoId:     video.media_id,
      media_id:    video.media_id,
      title:       video.title,
      sourceType:  video.source_type || "youtube",
      source_type: video.source_type || "youtube",
    });
    navigate("/analyze");
  };

  const clearHistory = () => {
    if (window.confirm("Clear all local history? (Signed-in history is stored on the server and won't be affected.)")) {
      localStorage.removeItem("cognira_history_guest");
      window.location.reload();
    }
  };

  // ── Styles injected once ───────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById("history-styles")) return;
    const style = document.createElement("style");
    style.id = "history-styles";
    style.textContent = `
      /* Stats */
      .history-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1px;
        background: var(--border);
        border-radius: var(--radius);
        overflow: hidden;
      }
      @media (max-width: 600px) { .history-stats { grid-template-columns: repeat(2, 1fr); } }
      .history-stat {
        background: var(--bg-surface);
        padding: 16px 20px;
        text-align: center;
      }
      .history-stat-value {
        font-size: 28px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1;
        margin-bottom: 4px;
      }
      .history-stat-label {
        font-size: 11px;
        color: var(--text-tertiary);
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

      /* Grid cards */
      .history-card {
        background: var(--bg-surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        overflow: hidden;
        cursor: pointer;
        transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        animation: card-in 0.35s ease both;
        animation-delay: calc(var(--i) * 35ms);
      }
      @keyframes card-in {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0);    }
      }
      .history-card:hover {
        transform: translateY(-3px);
        border-color: var(--accent-border);
        box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      }
      .history-card-thumb {
        position: relative;
        aspect-ratio: 16 / 9;
        background: var(--bg-elevated);
        overflow: hidden;
      }
      .history-card-thumb img {
        width: 100%; height: 100%;
        object-fit: cover;
        display: block;
        transition: transform 0.3s ease;
      }
      .history-card:hover .history-card-thumb img { transform: scale(1.04); }
      .history-card-fallback {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        background: var(--bg-elevated);
      }
      .history-card-overlay {
        position: absolute; inset: 0;
        background: rgba(0,0,0,0);
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
        border-radius: inherit;
      }
      .history-card:hover .history-card-overlay { background: rgba(0,0,0,0.45); }
      .history-card-play {
        font-size: 22px;
        color: #fff;
        opacity: 0;
        transform: scale(0.7);
        transition: opacity 0.2s, transform 0.2s;
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.5));
      }
      .history-card:hover .history-card-play { opacity: 1; transform: scale(1); }
      .history-card-badge {
        position: absolute;
        bottom: 7px; left: 7px;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: var(--badge-color);
        background: rgba(0,0,0,0.7);
        border: 1px solid var(--badge-color, var(--border));
        border-opacity: 0.3;
        padding: 2px 7px;
        border-radius: 4px;
        backdrop-filter: blur(4px);
      }
      .history-card-body { padding: 11px 13px 13px; }
      .history-card-title {
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        margin-bottom: 5px;
      }
      .history-card-meta { display: flex; align-items: center; gap: 8px; }

      /* List rows */
      .history-row {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s;
        animation: card-in 0.3s ease both;
        animation-delay: calc(var(--i) * 25ms);
      }
      .history-row:hover { background: var(--bg-elevated); }
      .history-row-thumb {
        position: relative;
        width: 88px; height: 50px;
        border-radius: 6px;
        overflow: hidden;
        flex-shrink: 0;
        background: var(--bg-elevated);
      }
      .history-row-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .history-row-info { flex: 1; min-width: 0; }
      .history-row-arrow {
        color: var(--text-tertiary);
        font-size: 14px;
        opacity: 0;
        transform: translateX(-4px);
        transition: opacity 0.15s, transform 0.15s;
        flex-shrink: 0;
      }
      .history-row:hover .history-row-arrow { opacity: 1; transform: translateX(0); }

      /* Grid layout */
      .history-grid-3 {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
      }
      @media (max-width: 900px) { .history-grid-3 { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 540px) { .history-grid-3 { grid-template-columns: 1fr; } }

      /* Group header */
      .history-group-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }
      .history-group-label {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .history-group-line {
        flex: 1;
        height: 1px;
        background: var(--border);
      }
      .history-group-count {
        font-size: 10px;
        color: var(--text-tertiary);
        background: var(--bg-elevated);
        padding: 1px 7px;
        border-radius: 10px;
        border: 1px solid var(--border);
      }

      /* Toolbar */
      .history-toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .history-search-wrap {
        position: relative;
        flex: 1;
        min-width: 180px;
        max-width: 340px;
      }
      .history-search-icon {
        position: absolute;
        left: 11px; top: 50%;
        transform: translateY(-50%);
        font-size: 13px;
        color: var(--text-tertiary);
        pointer-events: none;
      }
      .history-search-kbd {
        position: absolute;
        right: 10px; top: 50%;
        transform: translateY(-50%);
        font-size: 10px;
        color: var(--text-tertiary);
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 4px;
        padding: 1px 5px;
        font-family: monospace;
        pointer-events: none;
        transition: opacity 0.15s;
      }
      .history-toolbar input {
        width: 100%;
        padding-left: 32px !important;
        padding-right: 40px !important;
      }
      .history-view-toggle {
        display: flex;
        gap: 2px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 3px;
      }
      .history-view-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 5px 9px;
        border-radius: 5px;
        font-size: 13px;
        color: var(--text-tertiary);
        transition: background 0.15s, color 0.15s;
        line-height: 1;
      }
      .history-view-btn.active {
        background: var(--bg-surface);
        color: var(--text-primary);
        box-shadow: 0 1px 3px rgba(0,0,0,0.25);
      }
      .history-sort-select {
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        color: var(--text-secondary);
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 12px;
        cursor: pointer;
        outline: none;
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <div className="page-grid">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="card card-accent">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="subheading mb-8">◷ Session history</div>
            <h1 className="display" style={{ fontSize: "clamp(22px,4vw,30px)", marginBottom: 6 }}>
              {user?.name ? `${user.name}'s History` : "Your History"}
            </h1>
            <p className="body" style={{ color: "var(--text-secondary)", maxWidth: 480 }}>
              Every video, audio file, and document you've analyzed — click any to continue where you left off.
            </p>
          </div>
          {videoHistory.length > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearHistory}
              style={{ color: "var(--text-tertiary)", flexShrink: 0, marginTop: 4 }}>
              🗑 Clear local
            </button>
          )}
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────── */}
      {videoHistory.length > 0 && <StatsBar videos={videoHistory} />}

      {/* ── Empty state ────────────────────────────────────────────────── */}
      {videoHistory.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">◷</div>
            <div className="empty-title">No sessions yet</div>
            <div className="empty-sub">Videos and documents you analyze will appear here.</div>
            <button className="btn btn-primary mt-8" onClick={() => navigate("/analyze")}>
              Analyze your first session →
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ── Toolbar ──────────────────────────────────────────────── */}
          <div className="card card-sm">
            <div className="history-toolbar">
              {/* Search */}
              <div className="history-search-wrap">
                <span className="history-search-icon">⌕</span>
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search sessions…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onFocus={e => e.target.nextSibling && (e.target.nextSibling.style.opacity = "0")}
                  onBlur={e => e.target.nextSibling && (e.target.nextSibling.style.opacity = "1")}
                />
                <span className="history-search-kbd">/</span>
              </div>

              {/* Sort */}
              <select
                className="history-sort-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="date">Sort: Recent</option>
                <option value="title">Sort: A–Z</option>
                <option value="type">Sort: Type</option>
              </select>

              {/* View toggle */}
              <div className="history-view-toggle">
                <button className={`history-view-btn${view === "grid" ? " active" : ""}`} onClick={() => setView("grid")} title="Grid view">⊞</button>
                <button className={`history-view-btn${view === "list" ? " active" : ""}`} onClick={() => setView("list")} title="List view">☰</button>
              </div>

              {/* Result count */}
              {search && (
                <span className="caption" style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                  {sorted.length} result{sorted.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          {/* ── No results ─────────────────────────────────────────────── */}
          {sorted.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <div className="empty-icon">⌕</div>
                <div className="empty-title">No matches</div>
                <div className="empty-sub">Try a different search term.</div>
              </div>
            </div>
          ) : (
            /* ── Groups ──────────────────────────────────────────────── */
            Object.entries(grouped).map(([key, videos]) =>
              videos.length === 0 ? null : (
                <div key={key} className="card">
                  <div className="history-group-header">
                    <span className="history-group-label">{GROUP_LABELS[key]}</span>
                    <div className="history-group-line" />
                    <span className="history-group-count">{videos.length}</span>
                  </div>

                  {view === "grid" ? (
                    <div className="history-grid-3">
                      {videos.map((video, i) => (
                        <VideoCard
                          key={video.media_id || video.videoId}
                          video={video}
                          index={i}
                          onClick={() => open(video)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div>
                      {videos.map((video, i) => (
                        <VideoRow
                          key={video.media_id || video.videoId}
                          video={video}
                          index={i}
                          onClick={() => open(video)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            )
          )}
        </>
      )}
    </div>
  );
}

