import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Dashboard from "./components/Dashboard";
import VideoAnalysis from "./components/VideoAnalysis";
import History from "./components/History";
import Sidebar from "./components/Sidebar";
import SharedConversation from "./components/SharedConversation";
import { useConversations } from "./components/useConversations";
const API = process.env.REACT_APP_API_URL;

// ─── tiny fetch wrapper that always sends cookies ──────────────────────────
const apiFetch = (path, opts = {}) =>
  fetch(`${API}${path}`, {
    credentials: "include",            // send httpOnly cookie on every request
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts,
  });

function App() {
  const [user, setUser]                 = useState(null);
  const [videoHistory, setVideoHistory] = useState([]);
  const [showAuth, setShowAuth]         = useState(false);
  const [authReady, setAuthReady]       = useState(false); // true once /auth/me resolves

  // ── Restore session on page load via server cookie ───────────────────────
  // This replaces the old localStorage lookup and is instant (<50ms on LAN).
  // No password re-entry needed — the httpOnly cookie does the work.
  useEffect(() => {
    apiFetch("/auth/me")
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user_id) {
          setUser({ user_id: data.user_id, name: data.name, email: data.email });
          setVideoHistory(data.history || []);
        }
      })
      .catch(() => {})
      .finally(() => setAuthReady(true));
  }, []);

  // ── Mousemove ambient glow ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const container = document.querySelector(".live-bg-container");
      if (!container) return;
      container.style.setProperty("--mouse-x", `${(e.clientX / window.innerWidth) * 100}%`);
      container.style.setProperty("--mouse-y", `${(e.clientY / window.innerHeight) * 100}%`);
    };
    document.addEventListener("mousemove", handler);
    return () => document.removeEventListener("mousemove", handler);
  }, []);

  // ── Auth handlers ─────────────────────────────────────────────────────────
  const handleRegister = useCallback(async (name, email, password) => {
    const res  = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Registration failed.");
    }
    const data = await res.json();
    setUser({ user_id: data.user_id, name: data.name, email: data.email });
    setVideoHistory(data.history || []);
    setShowAuth(false);
  }, []);

  const handleLogin = useCallback(async (email, password) => {
    const res = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed.");
    }
    const data = await res.json();
    setUser({ user_id: data.user_id, name: data.name, email: data.email });
    setVideoHistory(data.history || []);
    setShowAuth(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setVideoHistory([]);
    setShowAuth(false);
  }, []);

  // ── Add to history ────────────────────────────────────────────────────────
  const addToHistory = useCallback(async (video) => {
    const entry = {
      media_id:    video.videoId,
      title:       video.title,
      source_type: video.sourceType || "youtube",
      viewed_at:   new Date().toISOString(),
    };

    setVideoHistory(prev =>
      [entry, ...prev.filter(v => v.media_id !== entry.media_id)].slice(0, 50)
    );

    if (user?.user_id) {
      apiFetch("/history", {
        method: "POST",
        body: JSON.stringify({
          user_id:    user.user_id,
          media_id:   video.videoId,
          title:      video.title,
          source_type: video.sourceType || "youtube",
        }),
      }).catch(() => {});
    }
  }, [user]);

  // ── Conversations ─────────────────────────────────────────────────────────
  const [currentVideo, setCurrentVideo] = useState(null);
  const convs = useConversations(user, currentVideo?.videoId);

  // ── Don't render until we know auth state (avoids flash) ─────────────────
  if (!authReady) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <Router>
      <div className="app-root">
        <div className="live-bg-container">
          <div className="bg-base-image" />
          <div className="bg-ambient-glow" />
        </div>

        <Sidebar
          user={user}
          onOpenAuth={() => setShowAuth(true)}
          onSignOut={handleSignOut}
          activeConvId={convs.activeConvId}
          conversations={convs.list}
          onSelectConv={convs.select}
          onConvRenamed={convs.update}
          onConvDeleted={convs.remove}
          onConvPinned={convs.update}
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
                convId={convs.activeConvId}
                onConvCreated={convs.add}
                onConvUpdated={convs.update}
              />
            } />
            <Route path="/history" element={
              <History
                videoHistory={videoHistory}
                setCurrentVideo={setCurrentVideo}
                user={user}
              />
            } />
            <Route path="/shared/:token" element={<SharedConversation />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {showAuth && (
          <AuthModal
            onRegister={handleRegister}
            onLogin={handleLogin}
            onClose={() => setShowAuth(false)}
          />
        )}
      </div>
    </Router>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// AuthModal — register / login tabs
// ─────────────────────────────────────────────────────────────────────────────

function AuthModal({ onRegister, onLogin, onClose }) {
  const [tab,    setTab]    = useState("login");   // "login" | "register"
  const [name,   setName]   = useState("");
  const [email,  setEmail]  = useState("");
  const [pw,     setPw]     = useState("");
  const [pw2,    setPw2]    = useState("");        // confirm (register only)
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");
  const [showPw, setShowPw] = useState(false);

  const switchTab = (t) => { setTab(t); setError(""); };

  const validate = () => {
    if (tab === "register") {
      if (!name.trim())            return "Please enter your name.";
      if (pw.length < 8)           return "Password must be at least 8 characters.";
      if (pw !== pw2)              return "Passwords do not match.";
    }
    if (!email.includes("@"))      return "Please enter a valid email.";
    if (!pw)                       return "Please enter your password.";
    return null;
  };

  const submit = async () => {
    const validErr = validate();
    if (validErr) { setError(validErr); return; }
    setBusy(true);
    setError("");
    try {
      if (tab === "register") {
        await onRegister(name.trim(), email.trim(), pw);
      } else {
        await onLogin(email.trim(), pw);
      }
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-brand">Cognira</div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`btn btn-secondary auth-tab${tab === "login" ? " active" : ""}`}
            onClick={() => switchTab("login")}
          >
            Sign in
          </button>
          <button
            className={`btn btn-primary auth-tab${tab === "register" ? " active" : ""}`}
            onClick={() => switchTab("register")}
          >
            Create account
          </button>
        </div>

        <div className="auth-fields">
          {tab === "register" && (
            <div className="field-group">
              <label>Name</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                onKeyDown={handleKey}
                autoFocus
              />
            </div>
          )}

          <div className="field-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              onKeyDown={handleKey}
              autoFocus={tab === "login"}
            />
          </div>

          <div className="field-group">
            <label>Password</label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                value={pw}
                onChange={e => setPw(e.target.value)}
                placeholder={tab === "register" ? "At least 8 characters" : "Your password"}
                onKeyDown={handleKey}
                style={{ paddingRight: "2.5rem" }}
              />
              <button
                type="button"
                className="pw-toggle"
                onClick={() => setShowPw(s => !s)}
                tabIndex={-1}
                style={{
                  position: "absolute", right: "0.6rem", top: "50%",
                  transform: "translateY(-50%)", background: "none",
                  border: "none", cursor: "pointer", color: "var(--text-muted)",
                  fontSize: "0.85rem",
                }}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {tab === "register" && (
            <div className="field-group">
              <label>Confirm password</label>
              <input
                type={showPw ? "text" : "password"}
                value={pw2}
                onChange={e => setPw2(e.target.value)}
                placeholder="Repeat password"
                onKeyDown={handleKey}
              />
            </div>
          )}
        </div>

        {error && (
          <div className="auth-error" style={{
            color: "var(--color-error, #f87171)",
            fontSize: "0.85rem",
            marginBottom: "0.75rem",
            padding: "0.5rem 0.75rem",
            background: "rgba(248,113,113,0.1)",
            borderRadius: "6px",
          }}>
            {error}
          </div>
        )}

        <button
          className="btn-auth-primary"
          onClick={submit}
          disabled={busy}
        >
          {busy
            ? (tab === "register" ? "Creating account…" : "Signing in…")
            : (tab === "register" ? "Create account" : "Sign in")}
        </button>

        <button className="btn-auth-ghost" onClick={onClose}>
          Continue without account
        </button>

        {tab === "login" && (
          <p style={{ textAlign: "center", marginTop: "0.75rem", fontSize: "0.82rem", color: "var(--text-muted)" }}>
            No account?{" "}
            <button
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", textDecoration: "underline" }}
              onClick={() => switchTab("register")}
            >
              Create one
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

export default App;