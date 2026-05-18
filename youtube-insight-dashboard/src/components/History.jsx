import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const groupByDate = (videos) => {
  const groups = {
    today: [],
    yesterday: [],
    thisWeek: [],
    older: [],
  };

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const weekAgo = new Date(today);
  weekAgo.setDate(today.getDate() - 7);

  videos.forEach((video) => {
    const date = new Date(video.viewed_at || video.timestamp);

    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (day.getTime() === today.getTime()) {
      groups.today.push(video);
    } else if (day.getTime() === yesterday.getTime()) {
      groups.yesterday.push(video);
    } else if (date >= weekAgo) {
      groups.thisWeek.push(video);
    } else {
      groups.older.push(video);
    }
  });

  return groups;
};
const formatTitle = (key) => {
  switch (key) {
    case "today":
      return "Today";
    case "yesterday":
      return "Yesterday";
    case "thisWeek":
      return "This Week";
    case "older":
      return "Older";
    default:
      return key;
  }
};
const History = ({ videoHistory, setCurrentVideo }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredHistory = videoHistory.filter((video) =>
    (video.title || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVideoClick = (video) => {
    setCurrentVideo(video);
    navigate("/analyze");
  };

  const clearHistory = () => {
    if (window.confirm("Are you sure you want to clear all history?")) {
      localStorage.removeItem("cognira_history_guest"); // ✅ fixed key
      window.location.reload();
    }
  };

  const groupedHistory = groupByDate(filteredHistory);

  return (
    <div className="section-grid">
      
      {/* Header */}
      <div className="glass-card pad-lg history-header">
        <div>
          <h1 className="hero-title">Your Sessions</h1>
          <p className="hero-subtitle">
            Search and revisit your analyzed videos, audio, and uploads.
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="glass-card pad-lg history-controls">
        <div className="search-bar">
          <input
            type="text"
            className="input-field search-input"
            placeholder="Search sessions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {videoHistory.length > 0 && (
          <button className="btn-secondary clear-btn" onClick={clearHistory}>
            Clear History
          </button>
        )}
      </div>

      {/* Empty states */}
      {videoHistory.length === 0 ? (
        <div className="glass-card pad-lg empty-state">
          <h3>No history yet</h3>
          <p>Sessions you analyze will appear here.</p>
          <button className="btn-primary" onClick={() => navigate("/analyze")}>
            Analyze your first session
          </button>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="glass-card pad-lg empty-state">
          <h3>No results found</h3>
          <p>Try a different search term.</p>
        </div>
      ) : (
        <div className="history-content">
          {Object.entries(groupedHistory).map(([key, videos]) =>
            videos.length > 0 ? (
              <Section
                key={key}
                title={formatTitle(key)}
                videos={videos}
                onClick={handleVideoClick}
              />
            ) : null
          )}
        </div>
      )}
    </div>
  );
};
const Section = ({ title, videos, onClick }) => {
  return (
    <div className="glass-card pad-lg section-block">
      <h2 className="section-title">{title}</h2>

      <div className="history-grid">
        {videos.map((video) => (
          <VideoCard
            key={video.media_id || video.videoId}
            video={video}
            onClick={() => onClick(video)}
          />
        ))}
      </div>
    </div>
  );
};
const VideoCard = ({ video, onClick }) => {
  const isYoutube = video.source_type === "youtube" || !video.source_type;

  return (
    <div className="history-video-card" onClick={onClick}>
      
      <div className="video-thumbnail">
        {isYoutube ? (
          <img
            src={`https://img.youtube.com/vi/${video.media_id}/mqdefault.jpg`}
            alt={video.title}
          />
        ) : (
          <div className="video-fallback">
            {video.source_type === "upload" ? "📁" : "🎧"}
          </div>
        )}

        <div className="video-overlay">
          <span className="play-icon">▶</span>
        </div>
      </div>

      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <p className="video-date">
          {new Date(video.viewed_at || video.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

export default History;