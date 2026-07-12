import React, { useState, useRef, useEffect, useCallback } from "react";
import { apiFetch } from "../App";   // JWT-aware fetch

const API = process.env.REACT_APP_API_URL || "";

// Hour-aware timestamp formatting/parsing — mirrors rag.py's format_timestamp /
// TIMESTAMP_RE on the backend. Needed here because this component builds its
// own excerpts and citations entirely client-side (talks to Groq directly),
// so it doesn't inherit the backend fix.
function formatTimestamp(seconds) {
  seconds = Math.max(0, Math.trunc(seconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Single-pass ref rendering: [para N] → teal button, [MM:SS]/[H:MM:SS] → amber button.
// The (\d{1,4}) leading group (no hour separator) tolerates the model flattening
// hours into raw minutes when it cites (e.g. "[116:10]" for 1h56m10s) — same
// leniency as the backend's TIMESTAMP_RE, so long-video citations still render
// as clickable badges instead of falling through as plain bracket text.
const COMBINED_RE = /\[para(?:graph)?\s*(\d+)\]|\[(?:(\d{1,2}):(\d{2}):(\d{2})|(\d{1,4}):(\d{2}))\]/gi;

function renderAnswer(raw) {
  const escaped = raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(COMBINED_RE, (match, paraNum, h, hm, hs, mm, ss) => {
    if (paraNum !== undefined) {
      return `<button class="ref-para" data-para="${paraNum}">[para ${paraNum}]</button>`;
    }
    const sec = h !== undefined
      ? parseInt(h, 10) * 3600 + parseInt(hm, 10) * 60 + parseInt(hs, 10)
      : parseInt(mm, 10) * 60 + parseInt(ss, 10);
    return `<button class="ref-ts" data-time="${sec}">[${match.slice(1, -1)}]</button>`;
  });
}

const SYSTEM_PROMPT = `You are a strict document/transcript analyst. Your ONLY knowledge source is the excerpts provided.

ABSOLUTE RULES:
1. Use ONLY information stated in the provided excerpts. Zero outside knowledge.
2. If the excerpts do not clearly contain the answer, reply with exactly: I don't know
3. Every factual claim MUST include an inline reference:
   - Video/audio: copy the reference exactly as shown — [MM:SS] e.g. [02:34], or [H:MM:SS] for longer videos e.g. [1:15:23]
   - Documents:   [para N] e.g. [para 3]
4. Do NOT invent, infer, extrapolate, or guess.
5. Keep your answer to 2–5 sentences.
6. Do not repeat the question.`;

const USER_TEMPLATE = (history, context, question) =>
  `Conversation history:\n${history}\n\nExcerpts (cite these inline):\n${context}\n\nQuestion: ${question}\n\nAnswer (with inline references), or "I don't know":`;

function formatDocs(docs) {
  return docs
    .map((doc) => {
      const src = doc.metadata?.source || "video";
      if (src === "docx") {
        return `[para ${doc.metadata?.paragraph || 0}] ${doc.page_content}`;
      }
      const ts = doc.metadata?.start || 0;
      return `[${formatTimestamp(ts)}] ${doc.page_content}`;
    })
    .join("\n\n");
}

function CragBadge({ crag }) {
  if (!crag || crag.score == null) return null;
  const pct = Math.round(crag.score * 100);
  const low = crag.score < 0.5;
  return (
    <span
      title={crag.corrected
        ? "Initial retrieval had low confidence, so the search was automatically widened."
        : "Retrieval confidence for this answer."}
      style={{
        fontSize: 11, marginLeft: 8, padding: "2px 8px",
        borderRadius: 999, border: "1px solid var(--border)",
        color: low ? "#f59e0b" : "var(--text-tertiary)",
        background: "var(--bg-elevated)",
      }}
    >
      {crag.corrected ? "↻ widened · " : ""}{pct}% relevance
    </span>
  );
}
// ─────────────────────────────────────────────────────────────────────────────
// NOTE / EXPORT helpers (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
const NOTE_QUESTIONS = [
  { heading: "Key Concepts",            question: "List the 3-5 most important concepts or definitions introduced. One clear sentence per bullet. No timestamps." },
  { heading: "Main Points & Explanations", question: "What are the main points or arguments made? List as concise bullet points." },
  { heading: "Examples & Case Studies", question: "What specific examples or analogies are used? List each as a short bullet. If none, reply: None mentioned." },
  { heading: "Conclusions & Recommendations", question: "What conclusions or recommendations are given? List as bullet points." },
];
const SUMMARY_Q  = "Write a 2-3 sentence executive summary. What is this about and what is the main insight?";
const TAKEAWAY_Q = "List exactly 3 key takeaways — the 3 things a student must remember. Each: one sentence, no timestamps.";

async function askGroqWithContext(context, question, groqKey) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant", temperature: 0, max_tokens: 400,
      messages: [
        { role: "system", content: "You are a strict transcript analyst. Answer ONLY using the provided transcript excerpts. No outside knowledge." },
        { role: "user",   content: `Transcript excerpts:\n${context}\n\nQuestion: ${question}\n\nAnswer:` },
      ],
    }),
  });
  if (!res.ok) return "";
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

function parseBullets(text) {
  if (!text) return [];
  return text.split("\n").map(l => l.replace(/^[\s\-*•\d.]+/, "").trim()).filter(l => l.length > 8).slice(0, 8);
}

export default function AskQuestion({
  videoData,
  user,
  groqKey,
  onNeedKey,
  convId,
  initialMessages,
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
  const [localConvId,   setLocalConvId]   = useState(convId || null);
  const [shareUrl,      setShareUrl]      = useState(null);
  const [shareCopied,   setShareCopied]   = useState(false);

  const bottomRef    = useRef(null);
  
  const lastVideoRef = useRef(videoId);
  const [currentCrag, setCurrentCrag] = useState(null); 
  useEffect(() => {
    if (!videoId) return;
    if (videoId === lastVideoRef.current) return; 
    lastVideoRef.current = videoId;
    setChat([]);
    setLocalConvId(null);
    setShareUrl(null);
    setError("");
    setCurrentAnswer("");
  }, [videoId]);

  useEffect(() => {
    if (!convId) {
      setLocalConvId(null);
      setChat([]);
      setShareUrl(null);
      return;
    }

    if (convId === localConvId) return; 

    setLocalConvId(convId);

    if (initialMessages && initialMessages.length > 0) {
      setChat(initialMessages);
    } else {
    
      fetch(`${API}/conversation/${convId}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (!data) return;
          setChat(data.messages || []);
          setShareUrl(data.share_token
            ? `${window.location.origin}/shared/${data.share_token}`
            : null);
        })
        .catch(() => {});
    }
  }, [convId]); 
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0 && convId === localConvId) {
      setChat(initialMessages);
    }
  }, [initialMessages]); 

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [currentAnswer, chat]);

  
  const ensureConversation = useCallback(async (firstQuestion) => {
    if (localConvId) return localConvId;

    if (!user?.user_id) {
     
      const tempId = `local_${Date.now()}`;
      setLocalConvId(tempId);
      return tempId;
    }

    try {
      const res = await apiFetch("/conversations", {
        method: "POST",
        body: JSON.stringify({
          user_id:  user.user_id,
          media_id: videoId,                              
          title:    firstQuestion.slice(0, 60),            
        }),
      });
      if (!res.ok) return null;
      const conv = await res.json();
      setLocalConvId(conv.conv_id);
      onConvCreated?.(conv);
      return conv.conv_id;
    } catch { return null; }
  }, [localConvId, user, videoId, onConvCreated]);

  const persistTurn = useCallback(async (cid, turn) => {
    if (!user?.user_id || !cid || cid.startsWith("local_")) return;
    try {
      const res = await apiFetch(`/conversations/${cid}/messages`, {
        method: "POST",
        body: JSON.stringify({ conv_id: cid, messages: [turn] }),
      });
      if (res.ok) onConvUpdated?.(await res.json());
    } catch {}
  }, [user, onConvUpdated]);

  const handleAsk = async () => {
    if (!question.trim()) { setError("Enter a question."); return; }
    const key = groqKey || localStorage.getItem("groq_api_key") || "";
    if (!key) { onNeedKey?.(); setError("Add your free Groq API key to enable answers."); return; }

    setCurrentAnswer(""); setError(""); setIsLoading(true);
    setCurrentCrag(null);                         
    setStatus("Retrieving relevant content…");

    const cid = await ensureConversation(question.trim());

    try {
      const retrieveRes = await fetch(`${API}/retrieve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question, k: 14 }),
      });
      if (!retrieveRes.ok) throw new Error(`Retrieve failed: HTTP ${retrieveRes.status}`);
      const { docs, relevance_score, crag_corrected } = await retrieveRes.json();
      setCurrentCrag({ score: relevance_score, corrected: crag_corrected });

      if (!docs || docs.length === 0) {
        setCurrentAnswer("I don't know — no relevant content found.");
        setIsLoading(false); setStatus(""); return;
      }

      const context     = formatDocs(docs);
      const historyText = chat.slice(-5).map(h => `Q: ${h.question}\nA: ${h.answer}`).join("\n\n");

      setStatus("Generating answer…");

      const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user",   content: USER_TEMPLATE(historyText || "(none)", context, question) },
          ],
          max_tokens: 400, temperature: 0, stream: true,
        }),
      });

      if (!groqRes.ok) {
        const errData = await groqRes.json().catch(() => ({}));
        if (groqRes.status === 401) throw new Error("Invalid Groq API key. Please check your key in Settings.");
        if (groqRes.status === 429) throw new Error("Groq rate limit reached. Wait a moment and try again.");
        throw new Error(errData.error?.message || `Groq error ${groqRes.status}`);
      }

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
            const token = JSON.parse(payload).choices?.[0]?.delta?.content || "";
            if (token) { rawAnswer += token; setCurrentAnswer(rawAnswer); }
          } catch {}
        }
      }

      const turn = {
        question: askedQ,
        answer:   rawAnswer || "I don't know.",
        crag:     { score: relevance_score, corrected: crag_corrected },
      };
      setChat(prev => [...prev, turn]);
      await persistTurn(cid, turn);
      setCurrentAnswer(""); setCurrentCrag(null); setQuestion(""); setStatus(""); setIsLoading(false);

    } catch (e) {
      setError(e.message || "Something went wrong.");
      setIsLoading(false); setStatus("");
    }
  };

  const handleRefClick = (e) => {
    if (e.target.classList.contains("ref-ts")) {
      window.dispatchEvent(new CustomEvent("cognira:seek", {
        detail: { seconds: parseInt(e.target.dataset.time, 10), videoId },
      }));
    }
    if (e.target.classList.contains("ref-para")) {
      window.dispatchEvent(new CustomEvent("cognira:para", {
        detail: { paragraph: parseInt(e.target.dataset.para, 10), videoId },
      }));
    }
  };

  const handleExport = async () => {
    const key = groqKey || localStorage.getItem("groq_api_key") || "";
    if (!key) { onNeedKey?.(); setError("Add your Groq API key to export notes."); return; }

    setStatus("Loading transcript…");
    try {
      const retrieveRes = await fetch(`${API}/retrieve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question: "key concepts main points summary", k: 30 }),
      });
      if (!retrieveRes.ok) throw new Error("Could not load transcript.");
      const { docs } = await retrieveRes.json();
      if (!docs?.length) throw new Error("No transcript available for this video.");

      const context = docs.map(doc => {
        const ts = doc.metadata?.start || 0;
        return `[${formatTimestamp(ts)}] ${doc.page_content}`;
      }).join("\n\n");

      setStatus("Generating summary…");
      const summary = await askGroqWithContext(context, SUMMARY_Q, key);

      setStatus("Generating sections…");
      const sections = [];
      for (const { heading, question } of NOTE_QUESTIONS) {
        const raw     = await askGroqWithContext(context, question, key);
        const bullets = parseBullets(raw);
        if (bullets.length && !bullets.includes("None mentioned")) sections.push({ heading, bullets });
      }

      setStatus("Generating takeaways…");
      const key_takeaways = parseBullets(await askGroqWithContext(context, TAKEAWAY_Q, key));

      const seen = new Set();
      const timestamps = [];
      for (const doc of docs) {
        const ts = doc.metadata?.start || 0;
        if ([...seen].some(s => Math.abs(s - ts) < 45)) continue;
        seen.add(ts);
        timestamps.push({ seconds: ts, display: formatTimestamp(ts), label: doc.page_content.slice(0, 60).trim() });
        if (timestamps.length >= 6) break;
      }

      setStatus("Building document…");
      const exportRes = await fetch(`${API}/export/docx`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_id:      videoId,
          video_title:   videoData?.title || videoId,
          video_url:     sourceType === "youtube" ? `https://youtube.com/watch?v=${videoId}` : "",
          summary:       summary || "Summary not available.",
          sections,
          key_takeaways: key_takeaways.length ? key_takeaways : ["See the content for key insights."],
          timestamps,
        }),
      });
      if (!exportRes.ok) throw new Error("Export failed on server.");

      const blob = new Blob([await exportRes.arrayBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), { href: url });
      const disp = exportRes.headers.get("Content-Disposition") || "";
      a.download = disp.includes("filename=") ? disp.split("filename=")[1].replace(/"/g, "") : `${videoId}_notes.docx`;
      document.body.appendChild(a); 
      a.click();
      URL.revokeObjectURL(url); 
      document.body.removeChild(a);

    } catch (e) {
      setError(e.message || "Export failed.");
    } finally { setStatus(""); }
  };

  const handleShare = async () => {
    if (!user) { setError("Sign in to share conversations."); return; }
    try {
      let cid = localConvId;
      if (!cid || cid.startsWith("local_")) {
        const res  = await apiFetch("/conversations", {
          method: "POST",
          body: JSON.stringify({
            user_id:  user.user_id,
            media_id: videoId,
            title:    chat[0]?.question || "Shared conversation",
          }),
        });
        const conv = await res.json();
        cid = conv.conv_id;
        setLocalConvId(cid);
        onConvCreated?.(conv);
        await apiFetch(`/conversations/${cid}/messages`, {
          method: "POST",
          body: JSON.stringify({ conv_id: cid, messages: chat }),
        });
      }
      const res  = await apiFetch(`/conversations/${cid}/share`, { method: "POST" });
      const data = await res.json();
      const url  = `${window.location.origin}/shared/${data.share_token}`;
      setShareUrl(url);
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch { setError("Could not generate share link."); }
  };

  const handleUnshare = async () => {
    if (!localConvId) return;
    try {
      await apiFetch(`/conversations/${localConvId}/share`, { method: "DELETE" });
      setShareUrl(null);
    } catch { setError("Could not revoke link."); }
  };

  const handleClearChat = () => {
    setChat([]); setLocalConvId(null); setShareUrl(null);
    lastVideoRef.current = videoId; 
    onConvCreated?.(null);
  };

  const hasKey = !!(groqKey || localStorage.getItem("groq_api_key"));

  return (
    <div>
      {!hasKey && (
        <div className="status-box" style={{
          background: "rgba(232,168,56,0.08)", border: "1px solid rgba(232,168,56,0.3)",
          borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1 }}>
            Add your free <strong>Groq API key</strong> to enable AI answers — answers run directly in your browser.
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onNeedKey} style={{ flexShrink: 0 }}>Add key</button>
        </div>
      )}

      <div className="flex items-center gap-8 mb-16">
        <span className={`tag ${sourceType === "docx" ? "tag-teal" : "tag-accent"}`}>
          {sourceType === "docx" ? "Document · paragraph refs" : sourceType === "youtube" ? "YouTube · timestamps" : "Upload · timestamps"}
        </span>
        {localConvId && !localConvId.startsWith("local_") && (
          <span className="tag" style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", fontSize: 11 }}>● Saved</span>
        )}
        {hasKey && (
          <span className="tag" style={{ background: "rgba(34,197,94,0.1)", color: "rgb(34,197,94)", fontSize: 11 }}> Browser AI</span>
        )}
      </div>

      {shareUrl && (
        <div className="status-box" style={{
          background: "var(--bg-elevated)", border: "1px solid var(--accent-border)",
          borderRadius: "var(--radius)", padding: "10px 14px", marginBottom: 12,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)", flex: 1, wordBreak: "break-all" }}>🔗 {shareUrl}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(shareUrl); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}>
            {shareCopied ? "✓ Copied" : "Copy"}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: "var(--text-tertiary)" }} onClick={handleUnshare}>Revoke</button>
        </div>
      )}

     {chat.map((item, idx) => (
        <div key={idx} className="answer-box">
          <div className="answer-q">Q: {item.question} <CragBadge crag={item.crag} /></div>
          <div className="answer-text" dangerouslySetInnerHTML={{ __html: renderAnswer(item.answer) }} onClick={handleRefClick} />
        </div>
      ))}

      {currentAnswer && (
        <div className="answer-box" style={{ borderColor: "var(--accent-border)" }}>
          <div className="answer-q">Answering… <CragBadge crag={currentCrag} /></div>
          <div className="answer-text" dangerouslySetInnerHTML={{ __html: renderAnswer(currentAnswer) }} onClick={handleRefClick} />
        </div>
      )}

      <div ref={bottomRef} />

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
        <button className="btn btn-secondary" onClick={handleExport} disabled={isLoading}>↓ Export notes</button>
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