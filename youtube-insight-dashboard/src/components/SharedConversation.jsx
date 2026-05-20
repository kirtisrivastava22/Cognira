import { useParams, Link } from "react-router-dom";
import { useEffect, useState } from "react";

const API = process.env.VITE_API_URL;

// Reuse the same ref-rendering logic as AskQuestion
const COMBINED_RE = /\[para(?:graph)?\s*(\d+)\]|\[(\d{1,2}):(\d{2})\]/gi;

function renderAnswer(raw) {
  const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(COMBINED_RE, (match, paraNum, mm, ss) => {
    if (paraNum !== undefined) {
      return `<span class="ref-para-static">[para ${paraNum}]</span>`;
    }
    return `<span class="ref-ts-static">[${mm}:${ss}]</span>`;
  });
}

/**
 * SharedConversation — public read-only view of a shared conversation.
 * Route: /shared/:token
 */
export default function SharedConversation() {
  const { token } = useParams();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!token) { setError("No share token in URL."); setLoading(false); return; }

    fetch(`${API}/shared/${token}`)
      .then(res => {
        if (!res.ok) throw new Error(res.status === 404 ? "not_found" : "error");
        return res.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(err => {
        setError(err.message === "not_found"
          ? "This shared link was not found or has been revoked."
          : "Failed to load the shared conversation.");
        setLoading(false);
      });
  }, [token]);

  if (loading) return (
    <div className="page-grid" style={{ alignItems: "center", justifyContent: "center" }}>
      <div className="status-box status-loading"><span className="spinner" />Loading shared conversation…</div>
    </div>
  );

  if (error) return (
    <div className="page-grid">
      <div className="card">
        <div className="status-box status-error">⚠ {error}</div>
        <Link to="/" className="btn btn-secondary mt-16" style={{ display: "inline-flex" }}>← Back to Cognira</Link>
      </div>
    </div>
  );

  const messages = data?.messages || [];
  const title    = data?.title || "Shared conversation";
  // const mediaId  = data?.media_id;

  return (
    <div className="page-grid">
      {/* Header */}
      <div className="card card-accent">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span className="tag tag-accent" style={{ fontSize: 11 }}>Shared · Read-only</span>
        </div>
        <h1 className="display" style={{ fontSize: 20, marginBottom: 4 }}>{title}</h1>
        {data?.updated_at && (
          <div className="caption">Last updated {new Date(data.updated_at).toLocaleString()}</div>
        )}
      </div>

      {/* Messages */}
      <div className="card">
        {messages.length === 0 ? (
          <div className="caption" style={{ textAlign: "center", padding: "24px 0" }}>
            This conversation has no messages yet.
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className="answer-box" style={{ marginBottom: 16 }}>
              <div className="answer-q" style={{ marginBottom: 6, fontWeight: 700 }}>
                Q: {m.question}
              </div>
              <div
                className="answer-text"
                dangerouslySetInnerHTML={{ __html: renderAnswer(m.answer) }}
              />
            </div>
          ))
        )}
      </div>

      {/* CTA */}
      <div className="card" style={{ textAlign: "center" }}>
        <p className="body" style={{ marginBottom: 12 }}>
          Want to analyze your own content?
        </p>
        <Link to="/" className="btn btn-primary">Try Cognira free →</Link>
      </div>
    </div>
  );
}