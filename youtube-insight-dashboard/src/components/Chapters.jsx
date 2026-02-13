import React, { useState } from 'react';
import './Chapters.css';

const Chapters = ({ videoId }) => {
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadChapters = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`http://127.0.0.1:8000/chapters/${videoId}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setChapters(data.chapters);
    } catch (err) {
      console.error('Error loading chapters:', err);
      setError('Failed to load chapters. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleChapterClick = (startTime) => {
    // Open YouTube video at specific timestamp
    window.open(`https://www.youtube.com/watch?v=${videoId}&t=${startTime}s`, '_blank');
  };

  return (
    <div className="chapters">
      <button className="btn-primary load-chapters-btn" onClick={loadChapters} disabled={loading}>
        {loading ? (
          <>
            <span className="spinner"></span>
            Loading Chapters...
          </>
        ) : (
          'Load Chapters'
        )}
      </button>

      {error && (
        <div className="status-box error">
          ⚠️ <span>{error}</span>
        </div>
      )}

      {chapters.length > 0 && (
        <div className="chapters-list">
          {chapters.map((chapter, idx) => (
            <div
              key={idx}
              className="chapter-item"
              onClick={() => handleChapterClick(chapter.start_time)}
            >
              <div className="chapter-number">{idx + 1}</div>
              <div className="chapter-content">
                <div className="chapter-title">{chapter.title}</div>
                <div className="chapter-time">{chapter.timestamp}</div>
              </div>
              <div className="chapter-arrow">→</div>
            </div>
          ))}
        </div>
      )}

      {!loading && chapters.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">📑</div>
          <p>No chapters loaded yet. Click the button above to load chapters for this video.</p>
        </div>
      )}
    </div>
  );
};

export default Chapters;
