import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './History.css';

const History = ({ videoHistory, setCurrentVideo }) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredHistory = videoHistory.filter((video) =>
    video.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleVideoClick = (video) => {
    setCurrentVideo(video);
    navigate('/analyze');
  };

  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear all history?')) {
      localStorage.removeItem('videoHistory');
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
      const videoDay = new Date(videoDate.getFullYear(), videoDate.getMonth(), videoDate.getDate());

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
    <div className="history">
      <div className="history-header">
        <h1 className="page-title">Video History</h1>
        <p className="page-subtitle">
          View and manage your previously analyzed videos
        </p>
      </div>

      <div className="history-controls card">
        <div className="search-bar">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="input search-input"
            placeholder="Search videos..."
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

      {videoHistory.length === 0 ? (
        <div className="empty-history card">
          <div className="empty-icon">📚</div>
          <h3>No History Yet</h3>
          <p>Videos you analyze will appear here</p>
          <button className="btn-primary" onClick={() => navigate('/analyze')}>
            Analyze Your First Video
          </button>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="empty-history card">
          <div className="empty-icon">🔍</div>
          <h3>No Results Found</h3>
          <p>Try a different search term</p>
        </div>
      ) : (
        <div className="history-content">
          {groupedHistory.today.length > 0 && (
            <div className="history-section">
              <h2 className="section-heading">Today</h2>
              <div className="video-grid">
                {groupedHistory.today.map((video) => (
                  <VideoCard
                    key={video.videoId + video.timestamp}
                    video={video}
                    onClick={() => handleVideoClick(video)}
                  />
                ))}
              </div>
            </div>
          )}

          {groupedHistory.yesterday.length > 0 && (
            <div className="history-section">
              <h2 className="section-heading">Yesterday</h2>
              <div className="video-grid">
                {groupedHistory.yesterday.map((video) => (
                  <VideoCard
                    key={video.videoId + video.timestamp}
                    video={video}
                    onClick={() => handleVideoClick(video)}
                  />
                ))}
              </div>
            </div>
          )}

          {groupedHistory.thisWeek.length > 0 && (
            <div className="history-section">
              <h2 className="section-heading">This Week</h2>
              <div className="video-grid">
                {groupedHistory.thisWeek.map((video) => (
                  <VideoCard
                    key={video.videoId + video.timestamp}
                    video={video}
                    onClick={() => handleVideoClick(video)}
                  />
                ))}
              </div>
            </div>
          )}

          {groupedHistory.older.length > 0 && (
            <div className="history-section">
              <h2 className="section-heading">Older</h2>
              <div className="video-grid">
                {groupedHistory.older.map((video) => (
                  <VideoCard
                    key={video.videoId + video.timestamp}
                    video={video}
                    onClick={() => handleVideoClick(video)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const VideoCard = ({ video, onClick }) => {
  return (
    <div className="history-video-card" onClick={onClick}>
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
          {new Date(video.timestamp).toLocaleString()}
        </p>
      </div>
    </div>
  );
};

export default History;
