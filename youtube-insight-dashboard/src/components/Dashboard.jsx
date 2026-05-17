import React from "react";
import { useNavigate } from "react-router-dom";

const Dashboard = ({
  videoHistory,
  setCurrentVideo,
  isSignedIn,
  user,
  onOpenAuth,
  onContinueAsGuest,
}) => {
  const navigate = useNavigate();
  const recentVideos = videoHistory.slice(0, 6);

  const handleVideoClick = (video) => {
    setCurrentVideo(video);
    navigate("/analyze");
  };

  return (
    <div className="section-grid">
      <div className="glass-card hero-card">
        <div className="hero-badge">
          <span>{isSignedIn ? "Synced account" : "Guest mode"}</span>
        </div>

        <h1 className="hero-title">
          <span className="title">Cognira</span>
        </h1>

        <p className="hero-subtitle">
          Turn content into clarity.
          <br/>
          Ask any video, audio, lecture, or upload for instant answers, summaries, chapters, quizzes, and exportable notes.
        </p>

        <div className="hero-actions">
          <button className="btn-primary" onClick={() => navigate("/analyze")}>
            Start analyzing
          </button>

          {!isSignedIn && (
            <button className="btn-secondary" onClick={onOpenAuth}>
              Sign in to save history
            </button>
          )}

          {!isSignedIn && (
            <button className="btn-ghost" onClick={onContinueAsGuest}>
              Continue as guest
            </button>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-content">
            <h3 className="stat-value">{videoHistory.length}</h3>
            <p className="stat-label">
              {isSignedIn ? "Sessions synced" : "Sessions saved locally"}
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-content">
            <h3 className="stat-value">AI-Powered</h3>
            <p className="stat-label">Fast answers, chapters, quizzes</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-content">
            <h3 className="stat-value">Real-time</h3>
            <p className="stat-label">Streaming responses</p>
          </div>
        </div>
      </div>

      <div className="glass-card pad-lg">
        <h2 className="section-title">Quick Start</h2>
        <div className="quick-start-grid">
          <div className="quick-start-item" onClick={() => navigate("/analyze")}>
            
            <h3>Analyze media</h3>
            <p>Paste a YouTube URL or upload audio/video</p>
          </div>

          <div className="quick-start-item" onClick={() => navigate("/history")}>
            
            <h3>View history</h3>
            <p>Open your previous sessions</p>
          </div>

          <div className="quick-start-item">
            
            <h3>Ask questions</h3>
            <p>Get timestamped answers from content</p>
          </div>

          <div className="quick-start-item">
            <h3>Export notes</h3>
            <p>Download polished study notes</p>
          </div>
        </div>
      </div>

      {recentVideos.length > 0 && (
        <div className="glass-card pad-lg">
          <div className="card-header">
            <h2 className="section-title">Recent Sessions</h2>
            <button className="btn-secondary" onClick={() => navigate("/history")}>
              View all
            </button>
          </div>

          <div className="history-grid" style={{ marginTop: 14 }}>
            {recentVideos.map((video) => (
              <div
                key={`${video.videoId}-${video.timestamp}`}
                className="history-video-card"
                onClick={() => handleVideoClick(video)}
              >
                <div className="video-thumbnail">
                  {video.sourceType === "youtube" || !video.sourceType ? (
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
                        color: "white",
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
                  <p className="video-date">
                    {new Date(video.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="features-section">
  <h2 className="section-title">Features</h2>

  <div className="features-list">
    <div>
      <h3>AI Question Answering</h3>
      <p>Ask any question and get instant timestamped answers.</p>
    </div>

    <div>
      <h3>Smart Chapters</h3>
      <p>Jump to the right moment with auto-detected chapters.</p>
    </div>

    <div>
      <h3>Interactive Quizzes</h3>
      <p>Test understanding with AI-generated quizzes.</p>
    </div>

    <div>
      <h3>Export Notes</h3>
      <p>Download polished DOCX notes and study summaries.</p>
    </div>

    <div>
      <h3>Transcript Search</h3>
      <p>Search through the full transcript in seconds.</p>
    </div>

    <div>
      <h3>Timestamp Navigation</h3>
      <p>Click timestamps to jump to relevant moments.</p>
    </div>
  </div>
</div>
    </div>
  );
};

export default Dashboard;