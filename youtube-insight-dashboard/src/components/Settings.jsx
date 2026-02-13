import React, { useState, useEffect } from 'react';
import './Settings.css';

const Settings = () => {
  const [settings, setSettings] = useState({
    backendUrl: 'http://127.0.0.1:8000',
    theme: 'default',
    autoLoadChapters: false,
    defaultQuizQuestions: 5,
  });

  useEffect(() => {
    const savedSettings = localStorage.getItem('appSettings');
    if (savedSettings) {
      setSettings(JSON.parse(savedSettings));
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('appSettings', JSON.stringify(settings));
    alert('Settings saved successfully!');
  };

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset all settings?')) {
      const defaultSettings = {
        backendUrl: 'http://127.0.0.1:8000',
        theme: 'default',
        autoLoadChapters: false,
        defaultQuizQuestions: 5,
      };
      setSettings(defaultSettings);
      localStorage.setItem('appSettings', JSON.stringify(defaultSettings));
    }
  };

  return (
    <div className="settings">
      <div className="settings-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Configure your YouTube Insight Assistant</p>
      </div>

      <div className="settings-content card">
        <div className="setting-section">
          <h2 className="setting-title">🔗 Backend Configuration</h2>
          <div className="input-group">
            <label htmlFor="backend-url">Backend API URL</label>
            <input
              id="backend-url"
              type="text"
              className="input"
              value={settings.backendUrl}
              onChange={(e) =>
                setSettings({ ...settings, backendUrl: e.target.value })
              }
              placeholder="http://127.0.0.1:8000"
            />
            <p className="input-help">
              The URL where your FastAPI backend is running
            </p>
          </div>
        </div>

        <div className="setting-section">
          <h2 className="setting-title">🎨 Appearance</h2>
          <div className="input-group">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              className="input"
              value={settings.theme}
              onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
            >
              <option value="default">Default</option>
              <option value="dark">Dark (Coming Soon)</option>
              <option value="light">Light (Coming Soon)</option>
            </select>
          </div>
        </div>

        <div className="setting-section">
          <h2 className="setting-title">⚙️ Features</h2>
          
          <div className="checkbox-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.autoLoadChapters}
                onChange={(e) =>
                  setSettings({ ...settings, autoLoadChapters: e.target.checked })
                }
              />
              <span className="checkbox-custom"></span>
              <span className="checkbox-text">
                Automatically load chapters when analyzing a video
              </span>
            </label>
          </div>

          <div className="input-group">
            <label htmlFor="quiz-questions">Default Quiz Questions</label>
            <input
              id="quiz-questions"
              type="number"
              className="input"
              min="3"
              max="10"
              value={settings.defaultQuizQuestions}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  defaultQuizQuestions: parseInt(e.target.value),
                })
              }
            />
            <p className="input-help">Number of questions in generated quizzes (3-10)</p>
          </div>
        </div>

        <div className="setting-section">
          <h2 className="setting-title">💾 Data Management</h2>
          <div className="data-actions">
            <button
              className="btn-secondary"
              onClick={() => {
                if (window.confirm('Clear all video history?')) {
                  localStorage.removeItem('videoHistory');
                  alert('History cleared!');
                }
              }}
            >
              Clear History
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                const history = localStorage.getItem('videoHistory');
                if (history) {
                  const blob = new Blob([history], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'youtube-insight-history.json';
                  a.click();
                  URL.revokeObjectURL(url);
                } else {
                  alert('No history to export');
                }
              }}
            >
              Export History
            </button>
          </div>
        </div>

        <div className="setting-section">
          <h2 className="setting-title">ℹ️ About</h2>
          <div className="about-info">
            <div className="info-row">
              <span className="info-label">Version:</span>
              <span className="info-value">1.0.0</span>
            </div>
            <div className="info-row">
              <span className="info-label">Technology:</span>
              <span className="info-value">React + FastAPI + LangChain</span>
            </div>
            <div className="info-row">
              <span className="info-label">License:</span>
              <span className="info-value">MIT</span>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button className="btn-primary" onClick={handleSave}>
            Save Settings
          </button>
          <button className="btn-secondary" onClick={handleReset}>
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings;
