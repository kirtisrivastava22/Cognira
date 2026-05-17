import React, { useState, useEffect, useMemo } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import Dashboard from "./components/Dashboard";
import VideoAnalysis from "./components/VideoAnalysis";
import History from "./components/History";
import Settings from "./components/Settings";
import Sidebar from "./components/Sidebar";
import "./App.css";

function App() {
  const [videoHistory, setVideoHistory] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);

  const [isSignedIn, setIsSignedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const historyKey = useMemo(() => {
    if (isSignedIn && user?.id) return `knowitfast_history_${user.id}`;
    return "knowitfast_history_guest";
  }, [isSignedIn, user]);

  useEffect(() => {
    const savedAuth = localStorage.getItem("knowitfast_auth");
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        setIsSignedIn(Boolean(parsed?.isSignedIn));
        setUser(parsed?.user || null);
      } catch {
        localStorage.removeItem("knowitfast_auth");
      }
    }
  }, []);

  useEffect(() => {
    const savedHistory = localStorage.getItem(historyKey);
    if (savedHistory) {
      try {
        setVideoHistory(JSON.parse(savedHistory));
      } catch {
        setVideoHistory([]);
      }
    } else {
      setVideoHistory([]);
    }
  }, [historyKey]);

  const persistAuth = (nextIsSignedIn, nextUser) => {
    setIsSignedIn(nextIsSignedIn);
    setUser(nextUser);

    localStorage.setItem(
      "knowitfast_auth",
      JSON.stringify({
        isSignedIn: nextIsSignedIn,
        user: nextUser,
      }),
    );
  };

  const handleSignIn = (name, email) => {
    const safeName = name?.trim() || "KnowItFast User";
    const safeEmail = email?.trim() || "guest@knowitfast.app";

    const userId =
      safeEmail.toLowerCase().replace(/[^a-z0-9]/g, "_") +
      "_" +
      safeName.toLowerCase().replace(/[^a-z0-9]/g, "_");

    persistAuth(true, {
      id: userId,
      name: safeName,
      email: safeEmail,
    });

    setShowAuthModal(false);
  };

  const handleContinueAsGuest = () => {
    persistAuth(false, null);
    setShowAuthModal(false);
  };

  const handleSignOut = () => {
    persistAuth(false, null);
    setVideoHistory([]);
    setCurrentVideo(null);
    localStorage.removeItem("knowitfast_auth");
    setShowAuthModal(false);
  };

  const addToHistory = (video) => {
    const newHistory = [
      video,
      ...videoHistory.filter((v) => v.videoId !== video.videoId),
    ].slice(0, 50);

    setVideoHistory(newHistory);
    localStorage.setItem(historyKey, JSON.stringify(newHistory));
  };

  return (
    <Router>
      <div
        className={`knowitfast-app ${isSignedIn ? "signed-in" : "guest-mode"}`}
        style={{ backgroundImage: "url('/KnowItFastHeroBg2.png')" }}
      >
        <div className="knowitfast-overlay" />
        <div className="app-shell">
          <Sidebar
            isSignedIn={isSignedIn}
            user={user}
            onOpenAuth={() => setShowAuthModal(true)}
            onSignOut={handleSignOut}
          />

          <main className="main-content">
            <div className="page-wrap">
              <Routes>
                <Route
                  path="/"
                  element={
                    <Dashboard
                      videoHistory={videoHistory}
                      setCurrentVideo={setCurrentVideo}
                      isSignedIn={isSignedIn}
                      user={user}
                      onOpenAuth={() => setShowAuthModal(true)}
                      onContinueAsGuest={handleContinueAsGuest}
                    />
                  }
                />

                <Route
                  path="/analyze"
                  element={
                    <VideoAnalysis
                      currentVideo={currentVideo}
                      setCurrentVideo={setCurrentVideo}
                      addToHistory={addToHistory}
                      isSignedIn={isSignedIn}
                      user={user}
                      onOpenAuth={() => setShowAuthModal(true)}
                    />
                  }
                />

                <Route
                  path="/history"
                  element={
                    <History
                      videoHistory={videoHistory}
                      setCurrentVideo={setCurrentVideo}
                      isSignedIn={isSignedIn}
                      user={user}
                      onOpenAuth={() => setShowAuthModal(true)}
                    />
                  }
                />

                <Route
                  path="/settings"
                  element={
                    <Settings
                      isSignedIn={isSignedIn}
                      user={user}
                      onOpenAuth={() => setShowAuthModal(true)}
                      onSignOut={handleSignOut}
                    />
                  }
                />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>

          {showAuthModal && (
            <div
              className="auth-modal-backdrop"
              onClick={() => setShowAuthModal(false)}
            >
              <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
                <div className="auth-modal-header">
                  <div>
                    <div className="auth-badge">Cognira</div>
                    <h2>Save your sessions across devices</h2>
                    <p>
                      Use the app freely without login, or sign in to sync your
                      history.
                    </p>
                  </div>
                  <button
                    className="icon-btn"
                    onClick={() => setShowAuthModal(false)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>

                <AuthForm
                  onSignIn={handleSignIn}
                  onContinueAsGuest={handleContinueAsGuest}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Router>
  );
}

function AuthForm({ onSignIn, onContinueAsGuest }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="auth-form">
      <label className="auth-label">
        Name
        <input
          className="auth-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </label>

      <label className="auth-label">
        Email
        <input
          className="auth-input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>

      <div className="auth-actions">
        <button
          className="btn-primary auth-primary"
          onClick={() => onSignIn(name, email)}
        >
          Sign in & Save History
        </button>

        <button
          className="btn-secondary auth-secondary"
          onClick={onContinueAsGuest}
        >
          Continue as Guest
        </button>
      </div>
    </div>
  );
}

export default App;