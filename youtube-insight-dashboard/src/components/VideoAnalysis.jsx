import React, { useState, useEffect } from 'react';
import AskQuestion from './AskQuestion';
import Chapters from './Chapters';
import Quiz from './Quiz';
import './VideoAnalysis.css';

const VideoAnalysis = ({ currentVideo, setCurrentVideo, addToHistory }) => {
  const [activeTab, setActiveTab] = useState('ask');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoId, setVideoId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (currentVideo) {
      setVideoId(currentVideo.videoId);
      setVideoTitle(currentVideo.title);
      setVideoUrl(`https://www.youtube.com/watch?v=${currentVideo.videoId}`);
    }
  }, [currentVideo]);

  const extractVideoId = (url) => {
    try {
      const urlObj = new URL(url);
      
      // Handle different YouTube URL formats
      if (urlObj.hostname.includes('youtube.com')) {
        return urlObj.searchParams.get('v');
      } else if (urlObj.hostname.includes('youtu.be')) {
        return urlObj.pathname.slice(1);
      }
      
      return null;
    } catch {
      return null;
    }
  };

  const handleLoadVideo = async () => {
    setError('');
    
    const id = extractVideoId(videoUrl);
    
    if (!id) {
      setError('Invalid YouTube URL. Please enter a valid YouTube video link.');
      return;
    }

    setVideoId(id);
    
    // Fetch video title from YouTube
    try {
      const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
      const data = await response.json();
      
      if (data.title) {
        setVideoTitle(data.title);
        
        // Add to history
        const videoData = {
          videoId: id,
          title: data.title,
          timestamp: new Date().toISOString(),
        };
        
        setCurrentVideo(videoData);
        addToHistory(videoData);
      }
    } catch (err) {
      console.error('Failed to fetch video title:', err);
      setVideoTitle('Unknown Video');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleLoadVideo();
    }
  };

  return (
    <div className="video-analysis">
      <div className="video-input-section card">
        <h2 className="section-title">Enter YouTube Video URL</h2>
        <div className="input-row">
          <input
            type="text"
            className="input video-url-input"
            placeholder="https://www.youtube.com/watch?v=..."
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            onKeyPress={handleKeyPress}
          />
          <button className="btn-primary" onClick={handleLoadVideo}>
            Load Video
          </button>
        </div>
        {error && (
          <div className="status-box error">
            ⚠️ <span>{error}</span>
          </div>
        )}
      </div>

      {videoId && (
        <>
          <div className="video-header card">
            <div className="video-header-content">
              <div className="video-icon">🎬</div>
              <div className="video-details">
                <h2>Video Analysis</h2>
                <p className="video-title-display">{videoTitle || 'Loading...'}</p>
              </div>
            </div>
          </div>

          <div className="video-player-container card">
            <div className="video-player">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${videoId}`}
                title="YouTube video player"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              ></iframe>
            </div>
          </div>

          <div className="tabs-section card">
            <div className="tabs">
              <button
                className={`tab-btn ${activeTab === 'ask' ? 'active' : ''}`}
                onClick={() => setActiveTab('ask')}
              >
                Ask Question
              </button>
              <button
                className={`tab-btn ${activeTab === 'chapters' ? 'active' : ''}`}
                onClick={() => setActiveTab('chapters')}
              >
                Chapters
              </button>
              <button
                className={`tab-btn ${activeTab === 'quiz' ? 'active' : ''}`}
                onClick={() => setActiveTab('quiz')}
              >
                Quiz
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'ask' && <AskQuestion videoId={videoId} />}
              {activeTab === 'chapters' && <Chapters videoId={videoId} />}
              {activeTab === 'quiz' && <Quiz videoId={videoId} />}
            </div>
          </div>

          <div className="tips-box">
            <h3>💡 Tips:</h3>
            <ul>
              <li>Ask specific questions about the video content</li>
              <li>Click timestamps to jump to relevant moments</li>
              <li>Works best with videos that have captions</li>
              <li>Export your notes as PDF for later reference</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default VideoAnalysis;
