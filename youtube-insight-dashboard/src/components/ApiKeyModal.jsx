import React, { useState } from "react";

export default function ApiKeyModal({ onClose, onSaved }) {
  const [key,     setKey]     = useState(localStorage.getItem("groq_api_key") || "");
  const [showKey, setShowKey] = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState("");

  const handleSave = () => {
    const trimmed = key.trim();
    if (trimmed && !trimmed.startsWith("gsk_")) {
      setError("Groq API keys start with 'gsk_'. Please check your key.");
      return;
    }
    localStorage.setItem("groq_api_key", trimmed);
    onSaved?.(trimmed);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 900);
  };

  const handleClear = () => {
    localStorage.removeItem("groq_api_key");
    setKey("");
    onSaved?.("");
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <button className="modal-close" onClick={onClose}>✕</button>

        <div className="modal-brand" style={{ fontSize: 18 }}> AI Settings</div>

        <div style={{ fontSize: 13.5, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
          Answers run <strong style={{ color: "var(--text-primary)" }}>directly in your browser</strong> using
          your own free Groq API key — your server never touches it.
        </div>

        {/* Steps */}
        <div style={{
          background: "var(--bg-elevated)", borderRadius: "var(--radius)",
          padding: "12px 16px", marginBottom: 20, fontSize: 13,
          color: "var(--text-secondary)", lineHeight: 1.8,
        }}>
          <div>1. Go to <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer"
            style={{ color: "var(--accent)", textDecoration: "underline" }}>console.groq.com/keys</a></div>
          <div>2. Click <strong style={{ color: "var(--text-primary)" }}>Create API Key</strong></div>
          <div>3. Copy and paste it below</div>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-tertiary)" }}>
            Free tier: 30 req/min · 14,400 req/day — more than enough for personal use.
          </div>
        </div>

        <div className="field-group">
          <label>Your Groq API Key</label>
          <div style={{ position: "relative" }}>
            <input
              type={showKey ? "text" : "password"}
              value={key}
              onChange={e => { setKey(e.target.value); setError(""); }}
              placeholder="gsk_..."
              onKeyDown={e => e.key === "Enter" && handleSave()}
              autoFocus
              style={{ paddingRight: "4rem", fontFamily: "monospace", fontSize: 13 }}
            />
            <button
              type="button"
              onClick={() => setShowKey(s => !s)}
              style={{
                position: "absolute", right: "0.6rem", top: "50%",
                transform: "translateY(-50%)", background: "none",
                border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: "0.85rem",
              }}
            >
              {showKey ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        {/* Privacy note */}
        <div style={{
          fontSize: 12, color: "var(--text-tertiary)", marginBottom: 16,
          padding: "8px 12px", background: "rgba(34,197,94,0.06)",
          borderRadius: 6, border: "1px solid rgba(34,197,94,0.15)",
        }}>
          🔒 Stored only in <strong>your browser's localStorage</strong>. Never sent to Cognira's server.
          Your requests go directly from your browser to Groq.
        </div>

        {error && (
          <div style={{
            color: "var(--color-error, #f87171)", fontSize: 13, marginBottom: 12,
            padding: "8px 12px", background: "rgba(248,113,113,0.1)", borderRadius: 6,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn-auth-primary" onClick={handleSave} style={{ flex: 1 }}>
            {saved ? "✓ Saved!" : "Save Key"}
          </button>
          {key && (
            <button className="btn btn-ghost" onClick={handleClear} style={{ flexShrink: 0 }}>
              Clear
            </button>
          )}
        </div>

        <button className="btn-auth-ghost" onClick={onClose} style={{ marginTop: 8 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}