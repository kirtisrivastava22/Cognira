import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

const Dashboard = ({ videoHistory, setCurrentVideo }) => {
  const navigate = useNavigate();

  const handleVideoClick = (video) => {
    setCurrentVideo(video);
    navigate('/analyze');
  };

  const recentVideos = videoHistory.slice(0, 6);

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1 className="page-title">Welcome to YouTube Insight Assistant</h1>
          <p className="page-subtitle">
            Analyze YouTube videos with AI-powered question answering, chapter navigation, and interactive quizzes
          </p>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <h3 className="stat-value">{videoHistory.length}</h3>
            <p className="stat-label">Videos Analyzed</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">💡</div>
          <div className="stat-content">
            <h3 className="stat-value">AI-Powered</h3>
            <p className="stat-label">Smart Analysis</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <h3 className="stat-value">Real-time</h3>
            <p className="stat-label">Instant Answers</p>
          </div>
        </div>
      </div>

      <div className="quick-start card">
        <h2 className="section-title">Quick Start</h2>
        <div className="quick-start-grid">
          <div className="quick-start-item" onClick={() => navigate('/analyze')}>
            <div className="quick-start-icon">🎬</div>
            <h3>Analyze Video</h3>
            <p>Enter a YouTube URL to start analyzing</p>
          </div>

          <div className="quick-start-item" onClick={() => navigate('/history')}>
            <div className="quick-start-icon">📚</div>
            <h3>View History</h3>
            <p>Access your previously analyzed videos</p>
          </div>

          <div className="quick-start-item">
            <div className="quick-start-icon">❓</div>
            <h3>Ask Questions</h3>
            <p>Get instant answers from video content</p>
          </div>

          <div className="quick-start-item">
            <div className="quick-start-icon">📝</div>
            <h3>Take Quizzes</h3>
            <p>Test your understanding with AI-generated quizzes</p>
          </div>
        </div>
      </div>

      {recentVideos.length > 0 && (
        <div className="recent-videos card">
          <div className="card-header">
            <h2 className="section-title">Recent Videos</h2>
            <button 
              className="btn-secondary"
              onClick={() => navigate('/history')}
            >
              View All
            </button>
          </div>
          <div className="video-grid">
            {recentVideos.map((video) => (
              <div
                key={video.videoId}
                className="video-card"
                onClick={() => handleVideoClick(video)}
              >
                <div className="video-thumbnail">
                  <img
                    src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`}
                    alt={video.title}
                  />
                  <div className="video-overlay">
                    <span className="play-icon">▶️</span>
                  </div>
                </div>
                <div className="video-info">
                  <h3 className="video-title">{video.title}</h3>
                  <p className="video-date">
                    {new Date(video.timestamp).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="features card">
        <h2 className="section-title">Features</h2>
        <div className="features-grid">
          <div className="feature-item">
            <div className="feature-icon">🤖</div>
            <h3>AI Question Answering</h3>
            <p>Ask any question about the video and get instant, accurate answers powered by advanced AI</p>
          </div>

          <div className="feature-item">
            <div className="feature-icon">📑</div>
            <h3>Smart Chapters</h3>
            <p>Navigate through video content easily with AI-detected chapters and timestamps</p>
          </div>

          <div className="feature-item">
            <div className="feature-icon">✅</div>
            <h3>Interactive Quizzes</h3>
            <p>Test your understanding with automatically generated quizzes based on video content</p>
          </div>

          <div className="feature-item">
            <div className="feature-icon">📄</div>
            <h3>Export Notes</h3>
            <p>Download comprehensive PDF notes with summaries, Q&As, and key takeaways</p>
          </div>

          <div className="feature-item">
            <div className="feature-icon">🔍</div>
            <h3>Transcript Search</h3>
            <p>Search through the entire video transcript to find specific information quickly</p>
          </div>

          <div className="feature-item">
            <div className="feature-icon">⏱️</div>
            <h3>Timestamp Navigation</h3>
            <p>Click on timestamps in answers to jump directly to relevant video moments</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
