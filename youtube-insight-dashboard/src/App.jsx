import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import VideoAnalysis from "./components/VideoAnalysis";
import History from "./components/History";
import Sidebar from "./components/Sidebar";
import SharedConversation from "./components/SharedConversation";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function App() {
  const [user, setUser]               = useState(null);      // {user_id, name, email}
  const [videoHistory, setVideoHistory] = useState([]);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [showAuth, setShowAuth]         = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // ── Restore auth from localStorage ──────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("cognira_user");
    if (saved) {
      try {
        const u = JSON.parse(saved);
        setUser(u);
      } catch {
        localStorage.removeItem("cognira_user");
      }
    }
  }, []);

  // ── Load history (server if signed in, localStorage if guest) ───────────
  useEffect(() => {
    const loadHistory = async () => {
      if (user?.user_id) {
        try {
          const res  = await fetch(`${API}/history/${user.user_id}`);
          const data = await res.json();
          setVideoHistory(data.history || []);
        } catch {
          // Fallback to local
          const local = localStorage.getItem("cognira_history_guest");
          setVideoHistory(local ? JSON.parse(local) : []);
        }
      } else {
        const local = localStorage.getItem("cognira_history_guest");
        setVideoHistory(local ? JSON.parse(local) : []);
      }
      setHistoryLoaded(true);
    };
    loadHistory();
  }, [user]);

  // ── Sign in ─────────────────────────────────────────────────────────────
  const handleSignIn = useCallback(async (name, email) => {
    try {
      const res  = await fetch(`${API}/auth/signin`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name, email }),
      });
      if (!res.ok) throw new Error("Auth failed");
      const u = await res.json();
      setUser(u);
      localStorage.setItem("cognira_user", JSON.stringify(u));
      setShowAuth(false);
      // Reload history from server
      const hr  = await fetch(`${API}/history/${u.user_id}`);
      const hd  = await hr.json();
      setVideoHistory(hd.history || []);
    } catch {
      // Graceful degradation: store locally
      const userId = btoa(`${email}:${name}`).replace(/=/g, "").slice(0, 32);
      const u = { user_id: userId, name, email };
      setUser(u);
      localStorage.setItem("cognira_user", JSON.stringify(u));
      setShowAuth(false);
    }
  }, []);

  const handleSignOut = useCallback(() => {
    setUser(null);
    setVideoHistory([]);
    setCurrentVideo(null);
    localStorage.removeItem("cognira_user");
    setShowAuth(false);
  }, []);

  // ── Add to history (server + local) ─────────────────────────────────────
  const addToHistory = useCallback(async (video) => {
    const entry = {
      media_id:    video.videoId,
      title:       video.title,
      source_type: video.sourceType || "youtube",
      viewed_at:   new Date().toISOString(),
    };

    // Optimistic local update
    setVideoHistory(prev => {
      const next = [entry, ...prev.filter(v => v.media_id !== entry.media_id)].slice(0, 50);
      if (!user?.user_id) {
        localStorage.setItem("cognira_history_guest", JSON.stringify(next));
      }
      return next;
    });

    // Persist server-side if signed in
    if (user?.user_id) {
      try {
        await fetch(`${API}/history`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            user_id:    user.user_id,
            media_id:   video.videoId,
            title:      video.title,
            source_type: video.sourceType || "youtube",
          }),
        });
      } catch {/* non-fatal */}
    }
  }, [user]);
document.addEventListener('mousemove', (e) => {
  const container = document.querySelector('.live-bg-container');
  if (!container) return;
  
  // Calculate cursor position as a percentage of the viewport
  const x = (e.clientX / window.innerWidth) * 100;
  const y = (e.clientY / window.innerHeight) * 100;
  
  // Dynamically update CSS variables
  container.style.setProperty('--mouse-x', `${x}%`);
  container.style.setProperty('--mouse-y', `${y}%`);
});

  return (
    <Router>
      <div  className="app-root">
        <div class="live-bg-container">
    <div class="bg-base-image"></div>
    <div class="bg-ambient-glow"></div>
  </div>
        <Sidebar
          user={user}
          onOpenAuth={() => setShowAuth(true)}
          onSignOut={handleSignOut}
        />

        <main className="main-content">
          <Routes>
            <Route path="/" element={
              <Dashboard
                videoHistory={videoHistory}
                setCurrentVideo={setCurrentVideo}
                user={user}
                onOpenAuth={() => setShowAuth(true)}
              />
            } />
            <Route path="/analyze" element={
              <VideoAnalysis
                currentVideo={currentVideo}
                setCurrentVideo={setCurrentVideo}
                addToHistory={addToHistory}
                user={user}
                onOpenAuth={() => setShowAuth(true)}
              />
            } />
            <Route path="/history" element={
              <History
                videoHistory={videoHistory}
                setCurrentVideo={setCurrentVideo}
                user={user}
              />
            } />
            <Route path="/shared/:id" element={<SharedConversation />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {showAuth && (
          <AuthModal
            onSignIn={handleSignIn}
            onClose={() => setShowAuth(false)}
          />
        )}
      </div>
    </Router>
  );
}

function AuthModal({ onSignIn, onClose }) {
  const [name,  setName]  = useState("");
  const [email, setEmail] = useState("");
  const [busy,  setBusy]  = useState(false);

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    setBusy(true);
    await onSignIn(name.trim(), email.trim());
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-brand">Cognira</div>
        <h2 className="modal-title">Save your sessions</h2>
        <p className="modal-sub">Sign in once to sync history across all your devices.</p>

        <div className="auth-fields">
          <div className="field-group">
            <label>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              onKeyDown={e => e.key === "Enter" && submit()}
            />
          </div>
          <div className="field-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={e => e.key === "Enter" && submit()}
            />
          </div>
        </div>

        <button
          className="btn-auth-primary"
          onClick={submit}
          disabled={busy || !name.trim() || !email.trim()}
        >
          {busy ? "Signing in…" : "Sign in & sync history"}
        </button>
        <button className="btn-auth-ghost" onClick={onClose}>
          Continue without account
        </button>
      </div>
    </div>
  );
}

export default App;