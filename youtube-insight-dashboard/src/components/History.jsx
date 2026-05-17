import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const History = ({ videoHistory, setCurrentVideo }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const filteredHistory = videoHistory.filter((video) =>
    (video.title || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleVideoClick = (video) => {
    setCurrentVideo(video);
    navigate("/analyze");
  };

  const clearHistory = () => {
    if (window.confirm("Are you sure you want to clear all history?")) {
      localStorage.removeItem("videoHistory");
      window.location.reload();
    }
  };

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
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    videos.forEach((video) => {
      const videoDate = new Date(video.timestamp);
      const videoDay = new Date(
        videoDate.getFullYear(),
        videoDate.getMonth(),
        videoDate.getDate(),
      );

      if (videoDay.getTime() === today.getTime()) {
        groups.today.push(video);
      } else if (videoDay.getTime() === yesterday.getTime()) {
        groups.yesterday.push(video);
      } else if (videoDate >= weekAgo) {
        groups.thisWeek.push(video);
      } else {
        groups.older.push(video);
      }
    });

    return groups;
  };

  const groupedHistory = groupByDate(filteredHistory);

  return (
    <div className="section-grid">
      <div className="glass-card pad-lg">
        <div className="history-header">
          <div>
            <h1 className="hero-title" style={{ fontSize: "2.2rem" }}>
              Your sessions
            </h1>
            <p className="hero-subtitle" style={{ marginTop: 8 }}>
              Search and revisit your analyzed videos, audio, and uploads.
            </p>
          </div>
        </div>
      </div>

      <div className="history-controls glass-card pad-lg">
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
          <button className="btn-secondary clear-btn margin-top-lg" onClick={clearHistory}>
            Clear History
          </button>
        )}
      </div>

      {videoHistory.length === 0 ? (
        <div className="empty-history glass-card pad-lg">
          
          <h3>No history yet</h3>
          <p>Sessions you analyze will appear here.</p>
          <button className="btn-primary" onClick={() => navigate("/analyze")}>
            Analyze your first session
          </button>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="empty-history glass-card pad-lg">
          
          <h3>No results found</h3>
          <p>Try a different search term.</p>
        </div>
      ) : (
        <div className="history-content">
          {groupedHistory.today.length > 0 && (
            <Section title="Today" videos={groupedHistory.today} onClick={handleVideoClick} />
          )}

          {groupedHistory.yesterday.length > 0 && (
            <Section title="Yesterday" videos={groupedHistory.yesterday} onClick={handleVideoClick} />
          )}

          {groupedHistory.thisWeek.length > 0 && (
            <Section title="This Week" videos={groupedHistory.thisWeek} onClick={handleVideoClick} />
          )}

          {groupedHistory.older.length > 0 && (
            <Section title="Older" videos={groupedHistory.older} onClick={handleVideoClick} />
          )}
        </div>
      )}
    </div>
  );
};

const Section = ({ title, videos, onClick }) => {
  return (
    <div className="glass-card pad-lg">
      <h2 className="section-title">{title}</h2>
      <div className="history-grid">
        {videos.map((video) => (
          <VideoCard
            key={video.videoId + video.timestamp}
            video={video}
            onClick={() => onClick(video)}
          />
        ))}
      </div>
    </div>
  );
};

const VideoCard = ({ video, onClick }) => {
  const isYoutube = video.sourceType === "youtube" || !video.sourceType;

  return (
    <div className="history-video-card" onClick={onClick}>
      <div className="video-thumbnail">
        {isYoutube ? (
          <img
            src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
            alt={video.title}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "grid",
              placeItems: "center",
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.25), rgba(34,211,238,0.16))",
              fontSize: 42,
            }}
          >
            {video.sourceType === "upload" ? "📁" : "🎧"}
          </div>
        )}
        <div className="video-overlay">
          <span className="play-icon">▶</span>
        </div>
      </div>
      <div className="video-info">
        <h3 className="video-title">{video.title}</h3>
        <p className="video-date">{new Date(video.timestamp).toLocaleString()}</p>
      </div>
    </div>
  );
};

export default History;