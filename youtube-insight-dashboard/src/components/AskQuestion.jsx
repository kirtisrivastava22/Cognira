import React, { useState, useRef, useEffect } from "react";

const API = process.env.REACT_APP_API_URL;

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

// ── System prompt (same as backend _STREAM_SYSTEM) ────────────────────────
const SYSTEM_PROMPT = `You are a strict document/transcript analyst. Your ONLY knowledge source is the excerpts provided.

ABSOLUTE RULES:
1. Use ONLY information stated in the provided excerpts. Zero outside knowledge.
2. If the excerpts do not clearly contain the answer, reply with exactly: I don't know
3. Every factual claim MUST include an inline reference:
   - Video/audio: [MM:SS]  e.g. [02:34]
   - Documents:   [para N] e.g. [para 3]
4. Do NOT invent, infer, extrapolate, or guess.
5. Keep your answer to 2–5 sentences.
6. Do not repeat the question.`;

const USER_TEMPLATE = (history, context, question) =>
  `Conversation history:\n${history}\n\nExcerpts (cite these inline):\n${context}\n\nQuestion: ${question}\n\nAnswer (with inline references), or "I don't know":`;

// ── Format docs for prompt ────────────────────────────────────────────────
function formatDocs(docs) {
  return docs
    .map((doc) => {
      const src = doc.metadata?.source || "video";
      if (src === "docx") {
        return `[para ${doc.metadata?.paragraph || 0}] ${doc.page_content}`;
      }
      const ts = doc.metadata?.start || 0;
      const mm = String(Math.floor(ts / 60)).padStart(2, "0");
      const ss = String(ts % 60).padStart(2, "0");
      return `[${mm}:${ss}] ${doc.page_content}`;
    })
    .join("\n\n");
}

/**
 * AskQuestion — LLM calls run in the browser using the user's own Groq key.
 * The backend only handles vectorstore retrieval (/retrieve endpoint).
 *
 * Props:
 *   videoData      – { videoId, sourceType, title }
 *   user           – { user_id, name } | null
 *   groqKey        – string (from parent ApiKeyModal)
 *   onNeedKey      – () => void  called when no key is present
 *   convId         – active conversation ID (controlled by parent)
 *   onConvCreated  – (conv) => void
 *   onConvUpdated  – (conv) => void
 */
export default function AskQuestion({
  videoData,
  user,
  groqKey,
  onNeedKey,
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

  useEffect(() => {
    if (convId && convId !== activeConvId) {
      setActiveConvId(convId);
      loadConversation(convId);
    }
  }, [activeConvId, convId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentAnswer, chat]);

  const loadConversation = async (id) => {
    try {
      const res = await fetch(`${API}/conversation/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      setChat(data.messages || []);
      setShareUrl(data.share_token ? `${window.location.origin}/shared/${data.share_token}` : null);
    } catch {}
  };

  const ensureConversation = async () => {
    if (activeConvId) return activeConvId;
    if (!user) {
      const tempId = `local_${Date.now()}`;
      setActiveConvId(tempId);
      return tempId;
    }
    try {
      const res = await fetch(`${API}/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: user.user_id, media_id: videoId, title: "New conversation" }),
      });
      const conv = await res.json();
      setActiveConvId(conv.conv_id);
      onConvCreated?.(conv);
      return conv.conv_id;
    } catch { return null; }
  };

  const persistMessages = async (cid, newMessages) => {
    if (!user || !cid || cid.startsWith("local_")) return;
    try {
      const res = await fetch(`${API}/conversations/${cid}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conv_id: cid, messages: newMessages }),
      });
      if (res.ok) onConvUpdated?.(await res.json());
    } catch {}
  };

  // ── Core ask: retrieve from backend, generate in browser ─────────────────
  const handleAsk = async () => {
    if (!question.trim()) { setError("Enter a question."); return; }

    // Check API key
    const key = groqKey || localStorage.getItem("groq_api_key") || "";
    if (!key) {
      onNeedKey?.();
      setError("Add your free Groq API key to enable answers.");
      return;
    }

    setCurrentAnswer(""); setError(""); setIsLoading(true);
    setStatus("Retrieving relevant content…");

    const cid = await ensureConversation();

    try {
      // Step 1: Retrieve docs from backend (vectorstore lives on server)
      const retrieveRes = await fetch(`${API}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question, k: 14 }),
      });

      if (!retrieveRes.ok) throw new Error(`Retrieve failed: HTTP ${retrieveRes.status}`);
      const { docs } = await retrieveRes.json();

      if (!docs || docs.length === 0) {
        setCurrentAnswer("I don't know — no relevant content found.");
        setIsLoading(false); setStatus("");
        return;
      }

      const context = formatDocs(docs);
      const historyText = chat
        .slice(-5)
        .map((h) => `Q: ${h.question}\nA: ${h.answer}`)
        .join("\n\n");

      setStatus("Generating answer…");

      // Step 2: Call Groq directly from browser (user's own key, their IP)
      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user",   content: USER_TEMPLATE(historyText || "(none)", context, question) },
          ],
          max_tokens: 400,
          temperature: 0,
          stream: true,
        }),
      });

      if (!groqRes.ok) {
        const errData = await groqRes.json().catch(() => ({}));
        if (groqRes.status === 401) throw new Error("Invalid Groq API key. Please check your key in Settings.");
        if (groqRes.status === 429) throw new Error("Groq rate limit reached. Wait a moment and try again.");
        throw new Error(errData.error?.message || `Groq error ${groqRes.status}`);
      }

      // Step 3: Stream tokens directly in browser
      const reader  = groqRes.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buf = "", rawAnswer = "", askedQ = question;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") continue;
          try {
            const json  = JSON.parse(payload);
            const token = json.choices?.[0]?.delta?.content || "";
            if (token) { rawAnswer += token; setCurrentAnswer(rawAnswer); }
          } catch {}
        }
      }

      const newTurn = { question: askedQ, answer: rawAnswer || "I don't know." };
      setChat(prev => {
        const updated = [...prev, newTurn];
        persistMessages(cid, [newTurn]);
        return updated;
      });
      setCurrentAnswer(""); setQuestion(""); setStatus(""); setIsLoading(false);

    } catch (e) {
      setError(e.message || "Something went wrong.");
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
    if (!user) { setError("Sign in to share conversations."); return; }
    try {
      let cid = activeConvId;
      if (!cid || cid.startsWith("local_")) {
        const res = await fetch(`${API}/conversations`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: user.user_id, media_id: videoId, title: chat[0]?.question || "Shared conversation" }),
        });
        const conv = await res.json();
        cid = conv.conv_id;
        setActiveConvId(cid);
        onConvCreated?.(conv);
        await fetch(`${API}/conversations/${cid}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conv_id: cid, messages: chat }),
        });
      }
      const res  = await fetch(`${API}/conversations/${cid}/share`, { method: "POST" });
      const data = await res.json();
      const url  = `${window.location.origin}/shared/${data.share_token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { setError("Could not generate share link."); }
  };

  const handleUnshare = async () => {
    if (!activeConvId) return;
    try {
      await fetch(`${API}/conversations/${activeConvId}/share`, { method: "DELETE" });
      setShareUrl(null);
    } catch { setError("Could not revoke link."); }
  };

  const handleClearChat = () => {
    setChat([]); setActiveConvId(null); setShareUrl(null); onConvCreated?.(null);
  };

  const hasKey = !!(groqKey || localStorage.getItem("groq_api_key"));

  return (
    <div>
      {/* Key warning banner */}
      {!hasKey && (
        <div className="status-box" style={{
          background: "rgba(232,168,56,0.08)", border: "1px solid rgba(232,168,56,0.3)",
          borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>
            🔑 Add your free <strong>Groq API key</strong> to enable AI answers — answers run directly in your browser.
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onNeedKey} style={{ flexShrink: 0 }}>
            Add key
          </button>
        </div>
      )}

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
        {hasKey && (
          <span className="tag" style={{ background: "rgba(34,197,94,0.1)", color: "rgb(34,197,94)", fontSize: 11 }}>
            ⚡ Browser AI
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
            <button className="btn btn-ghost" onClick={handleShare} disabled={isLoading}>🔗 Share</button>
            <button className="btn btn-ghost" onClick={handleClearChat}>New chat</button>
          </>
        )}
      </div>

      {status && <div className="status-box status-loading mt-12"><span className="spinner" />{status}</div>}
      {error  && <div className="status-box status-error mt-12">⚠ {error}</div>}
    </div>
  );
}