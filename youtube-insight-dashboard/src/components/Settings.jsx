import React from "react";

const Settings = ({ isSignedIn, user, onOpenAuth, onSignOut }) => {
  return (
    <div className="section-grid">
      <div className="glass-card hero-card">
        <div className="hero-badge">
          <span>⚙️</span>
          <span>Settings</span>
        </div>

        <h1 className="hero-title">
          <span className="gradient-text">Your CogniraAI profile</span>
        </h1>

        <p className="hero-subtitle">
          Guest mode works immediately. Sign in if you want your history saved across devices.
        </p>
      </div>

      <div className="glass-card pad-lg">
        <h2 className="section-title">Account</h2>

        {isSignedIn ? (
          <div className="setting-card" style={{ padding: 18 }}>
            <div className="chip good">Signed in</div>
            <h3>{user?.name || "User"}</h3>
            <p>{user?.email || "Synced account"}</p>
            <div className="hero-actions">
              <button className="btn-secondary" onClick={onSignOut}>
                Sign out
              </button>
            </div>
          </div>
        ) : (
          <div className="setting-card" style={{ padding: 18 }}>
            <div className="chip">Guest mode</div>
            <h3>Not signed in</h3>
            <p>Your sessions are stored on this device only.</p>
            <div className="hero-actions">
              <button className="btn-primary" onClick={onOpenAuth}>
                Sign in to sync
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;