import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = () => {
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const navItems = [
    { path: '/', icon: '🏠', label: 'Dashboard' },
    { path: '/analyze', icon: '🎬', label: 'Analyze Video' },
    { path: '/history', icon: '📚', label: 'History' },
    { path: '/settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo-container">
          <div className="logo-icon">
            {/* You can use an emoji or place youtube2.png in the public folder */}
            <img
              src={`${process.env.PUBLIC_URL}/youtube2.png`}
              alt="YouTube Icon"
              onError={(e) => {
                // Fallback to emoji if image not found
                e.target.style.display = 'none';
                e.target.parentElement.innerHTML = '▶️';
              }}
            />
          </div>
          {!isCollapsed && (
            <div className="logo-text">
              <h1>YouTube Insight</h1>
              <p>Assistant</p>
            </div>
          )}
        </div>
        <button 
          className="collapse-btn"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? '→' : '←'}
        </button>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {!isCollapsed && <span className="nav-label">{item.label}</span>}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        {!isCollapsed && (
          <div className="footer-content">
            <p className="footer-text">Powered by RAG • FastAPI • LangChain</p>
          </div>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
