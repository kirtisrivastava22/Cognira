import React, { useState, useEffect, useCallback } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import LiveBackground from "./components/LiveBackground";
import Dashboard from "./components/Dashboard";
import VideoAnalysis from "./components/VideoAnalysis";
import History from "./components/History";
import Sidebar from "./components/Sidebar";
import SharedConversation from "./components/SharedConversation";
import { useConversations } from "./components/useConversations";

const API = process.env.REACT_APP_API_URL || "";

// ── JWT token helpers ─────────────────────────────────────────────────────
const TOKEN_KEY = "cognira_jwt";

export const getToken  = ()        => localStorage.getItem(TOKEN_KEY);
export const setToken  = (t)       => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = ()       => localStorage.removeItem(TOKEN_KEY);

// apiFetch always injects the JWT as a Bearer header
export const apiFetch = (path, opts = {}) => {
  const token = getToken();
  return fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
};

// ── Mobile bottom nav ─────────────────────────────────────────────────────
function MobileBottomNav() {
  return (
    <nav className="mobile-bottom-nav">
      {[
        { to: "/",        icon: "⬡", label: "Home"    },
        { to: "/analyze", icon: "◈", label: "Analyze" },
        { to: "/history", icon: "◷", label: "History" },
      ].map(({ to, icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) => `mobile-nav-item${isActive ? " active" : ""}`}
        >
          <span className="mobile-nav-icon">{icon}</span>
          <span className="mobile-nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

// ── Mobile top bar ────────────────────────────────────────────────────────
function MobileTopBar({ onMenuOpen }) {
  return (
    <div className="mobile-topbar">
      <div className="mobile-topbar-logo">
        <span />
        Cognira
      </div>
      <button className="mobile-menu-btn" onClick={onMenuOpen} aria-label="Open menu">
        ☰
      </button>
    </div>
  );
}

// ── Inner app ─────────────────────────────────────────────────────────────
function AppInner() {
  const navigate = useNavigate();

  const [user,         setUser]         = useState(null);
  const [videoHistory, setVideoHistory] = useState([]);
  const [showAuth,     setShowAuth]     = useState(false);
  const [authReady,    setAuthReady]    = useState(false);
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [currentVideo, setCurrentVideo] = useState(null);

  useEffect(() => { window.__hideLoader?.(); }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthReady(true);
      return;
    }
    apiFetch("/auth/me")
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (data?.user_id) {
          setUser({ user_id: data.user_id, name: data.name, email: data.email });
          setVideoHistory(data.history || []);
        } else {
          clearToken();
        }
      })
      .catch(() => { clearToken(); })
      .finally(() => setAuthReady(true));
  }, []);

  // ── Close sidebar on desktop resize ─────────────────────────────────────
  useEffect(() => {
    const handler = () => { if (window.innerWidth > 768) setSidebarOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // ── Auth handlers ────────────────────────────────────────────────────────
  const handleRegister = useCallback(async (name, email, password) => {
    const res = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Registration failed.");
    }
    const data = await res.json();
    setToken(data.token);                   
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
    setToken(data.token);                    // ← store JWT
    setUser({ user_id: data.user_id, name: data.name, email: data.email });
    setVideoHistory(data.history || []);
    setShowAuth(false);
  }, []);

  const handleSignOut = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => {});
    clearToken();                            // ← remove JWT
    setUser(null);
    setVideoHistory([]);
    setCurrentVideo(null);
    setShowAuth(false);
  }, []);

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
          user_id:     user.user_id,
          media_id:    video.videoId,
          title:       video.title,
          source_type: video.sourceType || "youtube",
        }),
      }).catch(() => {});
    }
  }, [user]);

  const convs = useConversations(user);

  const handleSelectConv = useCallback((conv) => {
    convs.select(conv);
    navigate("/analyze");
  }, [convs, navigate]);

  if (!authReady) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <div className="app-root">
      <LiveBackground />

      <div
        className={`sidebar-overlay${sidebarOpen ? " visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        user={user}
        onOpenAuth={() => setShowAuth(true)}
        onSignOut={handleSignOut}
        activeConvId={convs.activeConvId}
        conversations={convs.list}
        onSelectConv={handleSelectConv}
        onConvRenamed={convs.update}
        onConvDeleted={convs.remove}
        onConvPinned={convs.update}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <main className="main-content">
        <MobileTopBar onMenuOpen={() => setSidebarOpen(true)} />

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

      <MobileBottomNav />

      {showAuth && (
        <AuthModal
          onRegister={handleRegister}
          onLogin={handleLogin}
          onClose={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}

// ── App shell ─────────────────────────────────────────────────────────────
function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppInner />
    </Router>
  );
}

// ── AuthModal ─────────────────────────────────────────────────────────────
function AuthModal({ onRegister, onLogin, onClose }) {
  const [tab,    setTab]    = useState("login");
  const [name,   setName]   = useState("");
  const [email,  setEmail]  = useState("");
  const [pw,     setPw]     = useState("");
  const [pw2,    setPw2]    = useState("");
  const [busy,   setBusy]   = useState(false);
  const [error,  setError]  = useState("");
  const [showPw, setShowPw] = useState(false);

  const switchTab = t => { setTab(t); setError(""); };

  const validate = () => {
    if (tab === "register") {
      if (!name.trim())  return "Please enter your name.";
      if (pw.length < 8) return "Password must be at least 8 characters.";
      if (pw !== pw2)    return "Passwords do not match.";
    }
    if (!email.includes("@")) return "Please enter a valid email.";
    if (!pw)                  return "Please enter your password.";
    return null;
  };

  const submit = async () => {
    const validErr = validate();
    if (validErr) { setError(validErr); return; }
    setBusy(true); setError("");
    try {
      if (tab === "register") await onRegister(name.trim(), email.trim(), pw);
      else                    await onLogin(email.trim(), pw);
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleKey = e => { if (e.key === "Enter") submit(); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-brand">Cognira</div>
        <div className="modal-title">{tab === "login" ? "Welcome back" : "Create account"}</div>
        <div className="modal-sub">
          {tab === "login" ? "Sign in to sync your sessions." : "Start analysing content with AI."}
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[["login", "Sign in"], ["register", "Register"]].map(([t, label]) => (
            <button
              key={t}
              className={`btn btn-sm${tab === t ? " btn-primary" : " btn-ghost"}`}
              style={{ flex: 1, justifyContent: "center" }}
              onClick={() => switchTab(t)}
            >{label}</button>
          ))}
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
                style={{ paddingRight: "2.8rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPw(s => !s)}
                style={{
                  position: "absolute", right: "0.7rem", top: "50%",
                  transform: "translateY(-50%)", background: "none", border: "none",
                  cursor: "pointer", color: "var(--text-tertiary)", fontSize: "0.82rem", padding: "4px",
                }}
                tabIndex={-1}
              >{showPw ? "Hide" : "Show"}</button>
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
          <div style={{
            color: "#f87171", fontSize: "0.84rem", marginBottom: "0.75rem",
            padding: "0.5rem 0.75rem", background: "rgba(248,113,113,0.09)",
            borderRadius: "8px", border: "1px solid rgba(248,113,113,0.22)",
          }}>
            {error}
          </div>
        )}

        <button className="btn-auth-primary" onClick={submit} disabled={busy}>
          {busy
            ? (tab === "register" ? "Creating…" : "Signing in…")
            : (tab === "register" ? "Create account" : "Sign in")}
        </button>
        <button className="btn-auth-ghost" onClick={onClose}>Continue without account</button>
      </div>
    </div>
  );
}

export default App;