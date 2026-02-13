import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import VideoAnalysis from './components/VideoAnalysis';
import History from './components/History';
import Settings from './components/Settings';
import Sidebar from './components/Sidebar';
import './App.css';

function App() {
  const [videoHistory, setVideoHistory] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);

  useEffect(() => {
    // Load history from localStorage
    const savedHistory = localStorage.getItem('videoHistory');
    if (savedHistory) {
      setVideoHistory(JSON.parse(savedHistory));
    }
  }, []);

  const addToHistory = (video) => {
    const newHistory = [video, ...videoHistory.filter(v => v.videoId !== video.videoId)].slice(0, 50);
    setVideoHistory(newHistory);
    localStorage.setItem('videoHistory', JSON.stringify(newHistory));
  };

  return (
    <Router>
      <div className="app">
        <Sidebar />
        <div className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard videoHistory={videoHistory} setCurrentVideo={setCurrentVideo} />} />
            <Route 
              path="/analyze" 
              element={
                <VideoAnalysis 
                  currentVideo={currentVideo} 
                  setCurrentVideo={setCurrentVideo}
                  addToHistory={addToHistory}
                />
              } 
            />
            <Route path="/history" element={<History videoHistory={videoHistory} setCurrentVideo={setCurrentVideo} />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
