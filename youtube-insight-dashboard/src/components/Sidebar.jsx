import React from "react";
import { NavLink } from "react-router-dom";

const Sidebar = ({ isSignedIn, user, onOpenAuth, onSignOut }) => {
  return (
    <aside className="sidebar-shell">
      <div className="sidebar-top">
        <div className="side-brand">
          
          <div>
            <p className="side-brand-title">Cognira</p>
            <p className="side-brand-subtitle">Turn content into clarity.</p>
          </div>
        </div>

        <nav className="side-nav">
          <NavLink
            to="/"
            className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
          >
            
            <span>Dashboard</span>
          </NavLink>

          <NavLink
            to="/analyze"
            className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
          >
            
            <span>Analyze</span>
          </NavLink>

          <NavLink
            to="/history"
            className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
          >
            
            <span>History</span>
          </NavLink>

          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-pill ${isActive ? "active" : ""}`}
          >
            
            <span>Settings</span>
          </NavLink>
        </nav>

        {isSignedIn ? (
          <div className="glass-card side-profile-card">
            <p className="side-profile-name">{user?.name || "Signed in"}</p>
            <p className="side-profile-email">{user?.email || "Synced account"}</p>
            <div style={{ height: 12 }} />
            <button className="btn-secondary" onClick={onSignOut}>
              Sign out
            </button>
          </div>
        ) : (
          <div className="glass-card side-auth-card">
            <p className="side-profile-name">Guest mode</p>
            <p className="side-profile-email">
              Use the app freely, or sign in to sync your history.
            </p>
            <div style={{ height: 12 }} />
            <button className="btn-primary" onClick={onOpenAuth}>
              Sign in
            </button>
          </div>
        )}
      </div>

      <div className="side-footer">
        <div>Built for videos, audio, lectures, and uploads.</div>
      </div>
      
    </aside>
  );
};

export default Sidebar;