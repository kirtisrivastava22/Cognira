import React, { useState, useRef, useEffect } from "react";

const API = process.env.REACT_APP_API_URL || "/api";

// Single-pass ref rendering: [para N] → teal button, [MM:SS] → amber button
const COMBINED_RE = /\[para(?:graph)?\s*(\d+)\]|\[(\d{1,2}):(\d{2})\]/gi;

function renderAnswer(raw) {
  const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(COMBINED_RE, (match, paraNum, mm, ss) => {
    if (paraNum !== undefined) {
      return `<button class="ref-para" data-para="${paraNum}">[para ${paraNum}]</button>`;
    }
    const sec = parseInt(mm, 10) * 60 + parseInt(ss, 10);
    return `<button class="ref-ts" data-time="${sec}">[${mm}:${ss}]</button>`;
  });
}

/**
 * AskQuestion — upgraded with persistent conversations.
 *
 * Props:
 *   videoData      – { videoId, sourceType, title }
 *   user           – { user_id, name } | null
 *   convId         – active conversation ID (controlled by parent)
 *   onConvCreated  – (conv) => void  — called when a new conv is created
 *   onConvUpdated  – (conv) => void  — called after each answer is saved
 */
export default function AskQuestion({
  videoData,
  user,
  convId,
  onConvCreated,
  onConvUpdated,
}) {
  const videoId    = videoData?.videoId    || "";
  const sourceType = videoData?.sourceType || "youtube";

  const [question,      setQuestion]      = useState("");
  const [status,        setStatus]        = useState("");
  const [isLoading,     setIsLoading]     = useState(false);
  const [error,         setError]         = useState("");
  const [chat,          setChat]          = useState([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [activeConvId,  setActiveConvId]  = useState(convId || null);
  const [shareUrl,      setShareUrl]      = useState(null);
  const [shareCopied,   setShareCopied]   = useState(false);
  const bottomRef = useRef(null);

  // When parent switches conversation, reload it
  useEffect(() => {
    if (convId && convId !== activeConvId) {
      setActiveConvId(convId);
      loadConversation(convId);
    }
  }, [activeConvId,convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentAnswer, chat]);

  // ── Load existing conversation from server ────────────────────────────────
  const loadConversation = async (id) => {
    try {
      const res = await fetch(`${API}/conversation/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setChat(data.messages || []);
      if (data.share_token) {
        setShareUrl(`${window.location.origin}/shared/${data.share_token}`);
      } else {
        setShareUrl(null);
      }
    } catch {
      // ignore
    }
  };

  // ── Ensure a conversation exists before first message ────────────────────
  const ensureConversation = async () => {
    if (activeConvId) return activeConvId;

    // Guest mode: use local-only conversation ID
    if (!user) {
      const tempId = `local_${Date.now()}`;
      setActiveConvId(tempId);
      return tempId;
    }

    try {
      const res = await fetch(`${API}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id:  user.user_id,
          media_id: videoId,
          title:    "New conversation",
        }),
      });
      const conv = await res.json();
      setActiveConvId(conv.conv_id);
      onConvCreated?.(conv);
      return conv.conv_id;
    } catch {
      return null;
    }
  };

  // ── Persist messages to server after each answer ─────────────────────────
  const persistMessages = async (cid, newMessages) => {
    if (!user || !cid || cid.startsWith("local_")) return;
    try {
      const res = await fetch(`${API}/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conv_id: cid, messages: newMessages }),
      });
      if (res.ok) {
        const conv = await res.json();
        onConvUpdated?.(conv);
      }
    } catch {
      // silent — chat still works locally
    }
  };

  // ── Ask ───────────────────────────────────────────────────────────────────
  const handleAsk = async () => {
    if (!question.trim()) { setError("Enter a question."); return; }
    setCurrentAnswer(""); setError(""); setIsLoading(true);
    setStatus("Searching content…");

    const cid = await ensureConversation();

    try {
      const res = await fetch(`${API}/ask_stream`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question, history: chat }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      setStatus("Generating answer…");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "", rawAnswer = "", askedQ = question;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split("\n\n");
        buf = events.pop();

        for (const ev of events) {
          if (!ev.startsWith("data: ")) continue;
          const payload = JSON.parse(ev.slice(6));
          if (payload.type === "status")     setStatus(payload.value);
          if (payload.type === "token")      { rawAnswer += payload.value; setCurrentAnswer(rawAnswer); }
          if (payload.type === "correction") { rawAnswer = payload.value;  setCurrentAnswer(rawAnswer); }
          if (payload.type === "end") {
            const newTurn = { question: askedQ, answer: rawAnswer };
            setChat(prev => {
              const updated = [...prev, newTurn];
              persistMessages(cid, [newTurn]);
              return updated;
            });
            setCurrentAnswer(""); setQuestion(""); setStatus(""); setIsLoading(false);
          }
        }
      }
    } catch {
      setError("Could not reach backend. Make sure the server is running.");
      setIsLoading(false); setStatus("");
    }
  };

  // ── Reference clicks ──────────────────────────────────────────────────────
  const handleRefClick = (e) => {
    if (e.target.classList.contains("ref-ts")) {
      const sec = parseInt(e.target.dataset.time, 10);
      window.dispatchEvent(new CustomEvent("cognira:seek", { detail: { seconds: sec, videoId } }));
    }
    if (e.target.classList.contains("ref-para")) {
      const para = parseInt(e.target.dataset.para, 10);
      window.dispatchEvent(new CustomEvent("cognira:para", { detail: { paragraph: para, videoId } }));
    }
  };

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    setStatus("Generating notes…");
    try {
      const res = await fetch(`${API}/export/docx?video_id=${videoId}`, { method: "POST" });
      if (!res.ok) throw new Error("Export failed");
      const blob = new Blob([await res.arrayBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href = url;
      const disp = res.headers.get("Content-Disposition") || "";
      a.download = disp.includes("filename=") ? disp.split("filename=")[1].replace(/"/g, "") : `${videoId}_notes.docx`;
      document.body.appendChild(a); a.click();
      URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch { setError("Export failed."); }
    finally  { setStatus(""); }
  };

  // ── Share ─────────────────────────────────────────────────────────────────
  const handleShare = async () => {
    console.log("user in AskQuestion:", user);
  if (!user) {
    setError("Sign in to share conversations.");
    return;
  }

  try {
    // If no server conversation yet, create one and save current chat first
    let cid = activeConvId;

    if (!cid || cid.startsWith("local_")) {
      const res = await fetch(`${API}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id:  user.user_id,
          media_id: videoId,
          title:    chat[0]?.question || "Shared conversation",
        }),
      });
      const conv = await res.json();
      cid = conv.conv_id;
      setActiveConvId(cid);
      onConvCreated?.(conv);

      // Save all existing messages
      await fetch(`${API}/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conv_id: cid, messages: chat }),
      });
    }

    const res = await fetch(`${API}/conversations/${cid}/share`, { method: "POST" });
    const data = await res.json();
    const url = `${window.location.origin}/shared/${data.share_token}`;
    setShareUrl(url);
    await navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2500);

  } catch { 
    setError("Could not generate share link."); 
  }
};

  const handleUnshare = async () => {
    if (!activeConvId) return;
    try {
      await fetch(`${API}/conversations/${activeConvId}/share`, { method: "DELETE" });
      setShareUrl(null);
    } catch { setError("Could not revoke link."); }
  };

  const handleClearChat = async () => {
    setChat([]);
    setActiveConvId(null);
    setShareUrl(null);
    onConvCreated?.(null);
  };

  return (
    <div>
      {/* Source indicator */}
      <div className="flex items-center gap-8 mb-16">
        <span className={`tag ${sourceType === "docx" ? "tag-teal" : "tag-accent"}`}>
          {sourceType === "docx" ? "Document · paragraph refs" : sourceType === "youtube" ? "YouTube · timestamps" : "Upload · timestamps"}
        </span>
        {activeConvId && !activeConvId.startsWith("local_") && (
          <span className="tag" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 11 }}>
            ● Saved
          </span>
        )}
      </div>

      {/* Share banner */}
      {shareUrl && (
        <div className="status-box" style={{
          background: "var(--bg-elevated)", border: "1px solid var(--accent-border)",
          borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1, wordBreak: "break-all" }}>
            🔗 {shareUrl}
          </span>
          <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}>
            {shareCopied ? "✓ Copied" : "Copy"}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: "var(--text-tertiary)" }} onClick={handleUnshare}>
            Revoke
          </button>
        </div>
      )}

      {/* Chat history */}
      {chat.map((item, idx) => (
        <div key={idx} className="answer-box">
          <div className="answer-q">Q: {item.question}</div>
          <div className="answer-text" dangerouslySetInnerHTML={{ __html: renderAnswer(item.answer) }} onClick={handleRefClick} />
        </div>
      ))}

      {/* Streaming answer */}
      {currentAnswer && (
        <div className="answer-box" style={{ borderColor: "var(--accent-border)" }}>
          <div className="answer-q">Answering…</div>
          <div className="answer-text" dangerouslySetInnerHTML={{ __html: renderAnswer(currentAnswer) }} onClick={handleRefClick} />
        </div>
      )}

      <div ref={bottomRef} />

      {/* Input */}
      <div className="mt-16">
        <textarea
          rows={3}
          placeholder={sourceType === "docx" ? "Ask about this document…" : "Ask anything about this content…"}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
          disabled={isLoading}
        />
      </div>

      <div className="flex gap-8 mt-12" style={{ flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={handleAsk} disabled={isLoading}>
          {isLoading ? <><span className="spinner" /> Analyzing</> : "Ask"}
        </button>
        <button className="btn btn-secondary" onClick={handleExport} disabled={isLoading}>
          ↓ Export notes
        </button>
        {chat.length > 0 && (
          <>
            <button className="btn btn-ghost" onClick={handleShare} disabled={isLoading}>
              🔗 Share
            </button>
            <button className="btn btn-ghost" onClick={handleClearChat}>New chat</button>
          </>
        )}
      </div>

      {status && <div className="status-box status-loading mt-12"><span className="spinner" />{status}</div>}
      {error  && <div className="status-box status-error mt-12">⚠ {error}</div>}
    </div>
  );
}