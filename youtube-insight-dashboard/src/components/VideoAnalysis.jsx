import React, { useState, useEffect, useRef, useCallback } from "react";
import AskQuestion from "./AskQuestion";
import Chapters from "./Chapters";
import Quiz from "./Quiz";
const API = process.env.VITE_API_URL;

const ALLOWED_MEDIA = [".mp4", ".mp3", ".wav", ".mkv", ".m4a", ".webm"];
const ALLOWED_DOC   = [".docx", ".doc"];
const MAX_DOCX_WORDS = 20_000;

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname.includes("youtu.be"))   return u.pathname.slice(1);
  } catch {}
  return null;
}

/* ── YouTube player with postMessage seek ─────────────────────── */
function YouTubePlayer({ videoId }) {
  const iframeRef = useRef(null);

  // Listen for seek events and relay via postMessage
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.videoId !== videoId) return;
      const sec = e.detail?.seconds ?? 0;
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "seekTo", args: [sec, true] }),
        "*"
      );
    };
    window.addEventListener("cognira:seek", handler);
    return () => window.removeEventListener("cognira:seek", handler);
  }, [videoId]);

  return (
    <div className="player-wrap">
      <iframe
        ref={iframeRef}
        width="100%"
        height="400"
        src={`https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
        allow="autoplay; encrypted-media"
        allowFullScreen
        title="YouTube player"
        style={{ border: "none", display: "block" }}
      />
    </div>
  );
}

/* ── Uploaded media player with currentTime seek ──────────────── */
function MediaPlayer({ videoId, title }) {
  const mediaRef = useRef(null);
  const isAudio  = /\.(mp3|wav|m4a)$/i.test(title || "");

  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.videoId !== videoId) return;
      if (mediaRef.current) mediaRef.current.currentTime = e.detail?.seconds ?? 0;
    };
    window.addEventListener("cognira:seek", handler);
    return () => window.removeEventListener("cognira:seek", handler);
  }, [videoId]);

  const src = `${API}/media/${videoId}`;

  if (isAudio) {
    return (
      <div className="player-wrap" style={{ padding: "20px 24px", background: "var(--bg-elevated)" }}>
        <div className="flex items-center gap-12" style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 28 }}>🎵</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>{title}</div>
            <div className="caption mt-4">Whisper transcript · timestamps enabled</div>
          </div>
        </div>
        <audio ref={mediaRef} controls style={{ width: "100%" }}>
          <source src={src} />
        </audio>
      </div>
    );
  }

  return (
    <div className="player-wrap">
      <video ref={mediaRef} controls width="100%" style={{ display: "block", maxHeight: 420 }}>
        <source src={src} />
      </video>
    </div>
  );
}

/* ── DOCX viewer with para navigation + search ────────────────── */
function DocxViewer({ mediaId }) {
  const [paragraphs,    setParagraphs]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [matchIndex,    setMatchIndex]    = useState(0);
  const [activeParaIdx, setActiveParaIdx] = useState(-1);
  const [scrollPct,     setScrollPct]     = useState(0);
  const paraRefs  = useRef([]);
  const scrollRef = useRef(null);
  const clearTimerRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/doc/${mediaId}`)
      .then(r => r.json())
      .then(d => {
        const ps = (d.text || "").split(/\n\n+/).filter(p => p.trim().length > 0);
        setParagraphs(ps);
      })
      .catch(() => setParagraphs(["⚠️ Failed to load document."]))
      .finally(() => setLoading(false));
  }, [mediaId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight;
      setScrollPct(max > 0 ? Math.round((el.scrollTop / max) * 100) : 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loading]);

  const goToPara = useCallback((idx) => {
    paraRefs.current[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveParaIdx(idx);
    clearTimeout(clearTimerRef.current);
    clearTimerRef.current = setTimeout(() => setActiveParaIdx(-1), 3500);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const idx = Number(e.detail?.paragraph ?? -1);
      if (idx >= 0) goToPara(idx);
    };
    window.addEventListener("cognira:para", handler);
    return () => window.removeEventListener("cognira:para", handler);
  }, [goToPara]);

  const matches = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const hits = [];
    paragraphs.forEach((p, pi) => {
      let s = 0;
      const lower = p.toLowerCase();
      while (true) {
        const pos = lower.indexOf(q, s);
        if (pos === -1) break;
        hits.push({ pi, pos });
        s = pos + 1;
      }
    });
    return hits;
  }, [searchQuery, paragraphs]);

  useEffect(() => { setMatchIndex(0); }, [searchQuery]);
  useEffect(() => {
    if (matches[matchIndex]) goToPara(matches[matchIndex].pi);
  }, [matchIndex, matches, goToPara]);

  const renderText = (text, pi) => {
    if (!searchQuery.trim()) return text;
    const q = searchQuery.toLowerCase();
    const parts = [];
    let rem = text, off = 0;
    while (true) {
      const pos = rem.toLowerCase().indexOf(q);
      if (pos === -1) { parts.push(rem); break; }
      if (pos > 0) parts.push(rem.slice(0, pos));
      const currentOff = off;
      const gi = matches.findIndex(
        m => m.pi === pi && m.pos === currentOff + pos
      );
      const focus = gi === matchIndex;
      parts.push(
        <mark key={`${pi}-${off+pos}`} style={{
          background: focus ? "rgba(232,168,56,0.45)" : "rgba(232,168,56,0.18)",
          color: "var(--text-primary)", borderRadius: 3, padding: "0 2px",
          boxShadow: focus ? "0 0 0 2px rgba(232,168,56,0.5)" : "none",
        }}>
          {rem.slice(pos, pos + q.length)}
        </mark>
      );
      off += pos + q.length;
      rem = rem.slice(pos + q.length);
    }
    return parts;
  };

  const isHeading = (t) => t.trim().length < 80 && !/[.!?]$/.test(t.trim()) && /^[A-Z0-9]/.test(t.trim());

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-8" style={{
        padding: "8px 14px", borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)", flexShrink: 0,
      }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 260 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, opacity: 0.4 }}>⌕</span>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search in document…"
            style={{ paddingLeft: 28, height: 32, fontSize: 13 }}
          />
        </div>
        {searchQuery.trim() && (
          <div className="flex items-center gap-6" style={{ flexShrink: 0 }}>
            <span className="caption">{matches.length ? `${matchIndex + 1}/${matches.length}` : "0 matches"}</span>
            {matches.length > 0 && <>
              <button onClick={() => setMatchIndex(i => (i - 1 + matches.length) % matches.length)}
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 12 }}>↑</button>
              <button onClick={() => setMatchIndex(i => (i + 1) % matches.length)}
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", borderRadius: 4, padding: "2px 7px", cursor: "pointer", fontSize: 12 }}>↓</button>
            </>}
          </div>
        )}
        <div className="flex items-center gap-12" style={{ marginLeft: "auto" }}>
          <span className="caption">{paragraphs.length}p</span>
          <span className="caption">{scrollPct}%</span>
        </div>
      </div>

      {/* Progress */}
      <div style={{ height: 2, background: "var(--bg-elevated)", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${scrollPct}%`, background: "linear-gradient(90deg, var(--accent), var(--teal))", transition: "width 0.2s" }} />
      </div>

      {/* Body */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 20px 32px" }}>
        {loading ? (
          <div className="empty-state"><div className="spinner" /><span className="body">Loading document…</span></div>
        ) : (
          <div style={{ maxWidth: 700, margin: "0 auto" }}>
            {paragraphs.map((p, i) => {
              const heading  = isHeading(p);
              const isActive = activeParaIdx === i;
              return (
                <div key={i} ref={el => (paraRefs.current[i] = el)} style={{
                  display: "flex", gap: 12, marginBottom: heading ? 18 : 10,
                  padding: "8px 12px", borderRadius: 8,
                  background: isActive ? "rgba(232,168,56,0.08)" : "transparent",
                  boxShadow: isActive ? "0 0 0 1px var(--accent-border)" : "none",
                  transition: "all 0.4s ease",
                }}>
                  <span style={{
                    flexShrink: 0, width: 26, fontSize: 10, fontFamily: "DM Mono, monospace",
                    color: isActive ? "var(--accent)" : "var(--text-tertiary)",
                    textAlign: "right", userSelect: "none", paddingTop: heading ? 4 : 2,
                    transition: "color 0.3s",
                  }}>{i + 1}</span>
                  <div style={{ width: 2, flexShrink: 0, borderRadius: 1, background: isActive ? "var(--accent)" : "transparent", transition: "background 0.3s" }} />
                  {heading ? (
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: isActive ? "var(--accent)" : "var(--text-primary)", lineHeight: 1.5, letterSpacing: "0.01em" }}>
                      {renderText(p, i)}
                    </h3>
                  ) : (
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.8, color: isActive ? "var(--text-primary)" : "var(--text-secondary)", transition: "color 0.3s" }}>
                      {renderText(p, i)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main VideoAnalysis ───────────────────────────────────────── */
export default function VideoAnalysis({ currentVideo, setCurrentVideo, addToHistory, user, onOpenAuth, convId, onConvCreated, onConvUpdated })  {
  const [activeTab,  setActiveTab]  = useState("ask");
  const [inputMode,  setInputMode]  = useState("youtube");
  const [videoUrl,   setVideoUrl]   = useState("");
  const [videoId,    setVideoId]    = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [sourceType, setSourceType] = useState("youtube");
  const [error,      setError]      = useState("");
  const [warnMsg,    setWarnMsg]    = useState("");
  const [loading,    setLoading]    = useState(false);
  const [docxMeta,   setDocxMeta]   = useState(null);
  const [drag,       setDrag]       = useState(false);

  const fileRef = useRef(null);
  const docxRef = useRef(null);

  /* Restore from history nav */
  useEffect(() => {
    if (!currentVideo) return;
    setVideoId(currentVideo.videoId || currentVideo.media_id || "");
    setVideoTitle(currentVideo.title || "");
    setSourceType(currentVideo.sourceType || currentVideo.source_type || "youtube");
    setInputMode(
      (currentVideo.sourceType || currentVideo.source_type) === "docx"   ? "docx"
      : (currentVideo.sourceType || currentVideo.source_type) === "upload" ? "upload"
      : "youtube"
    );
    if ((currentVideo.sourceType || "youtube") === "youtube") {
      setVideoUrl(`https://www.youtube.com/watch?v=${currentVideo.videoId || currentVideo.media_id}`);
    }
  }, [currentVideo]);

  const resetState = () => { setError(""); setWarnMsg(""); setDocxMeta(null); };

  /* YouTube */
  const handleLoadVideo = async () => {
    resetState();
    const id = extractYouTubeId(videoUrl);
    if (!id) { setError("Enter a valid YouTube URL."); return; }
    setVideoId(id);
    setSourceType("youtube");
    setLoading(true);
    try {
      const res  = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
      const data = await res.json();
      const title = data.title || "Untitled Video";
      setVideoTitle(title);
      const vid = { videoId: id, title, timestamp: new Date().toISOString(), sourceType: "youtube" };
      setCurrentVideo(vid);
      addToHistory(vid);
    } catch { setVideoTitle("Untitled Video"); }
    finally { setLoading(false); }
  };

  /* Media upload */
  const handleMediaUpload = async (file) => {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_MEDIA.includes(ext)) { setError(`Unsupported type "${ext}".`); return; }
    resetState();
    setVideoTitle(file.name);
    setSourceType("upload");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${API}/ingest`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const vid = { videoId: data.media_id, title: data.title || file.name, timestamp: new Date().toISOString(), sourceType: "upload" };
      setVideoId(data.media_id);
      setVideoTitle(vid.title);
      setCurrentVideo(vid);
      addToHistory(vid);
      setActiveTab("ask");
    } catch (e) { setError("Upload failed: " + e.message); }
    finally { setLoading(false); }
  };

  /* DOCX upload */
  const handleDocxUpload = async (file) => {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_DOC.includes(ext)) { setError("Only .docx / .doc files accepted."); return; }
    resetState();
    setVideoTitle(file.name);
    setSourceType("docx");
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${API}/ingest`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDocxMeta({ word_count: data.word_count, truncated: data.truncated });
      if (data.truncated) setWarnMsg(`Trimmed to ${MAX_DOCX_WORDS.toLocaleString()} words.`);
      const vid = { videoId: data.media_id, title: data.title || file.name, timestamp: new Date().toISOString(), sourceType: "docx", wordCount: data.word_count };
      setVideoId(data.media_id);
      setVideoTitle(vid.title);
      setCurrentVideo(vid);
      addToHistory(vid);
      setActiveTab("ask");
    } catch (e) { setError("Upload failed: " + e.message); }
    finally { setLoading(false); }
  };

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (ALLOWED_DOC.includes(ext)) { setInputMode("docx"); handleDocxUpload(file); }
    else { setInputMode("upload"); handleMediaUpload(file); }
  };

  const videoData = videoId ? { videoId, sourceType, title: videoTitle } : null;
  const wordPct   = docxMeta ? Math.round((docxMeta.word_count / MAX_DOCX_WORDS) * 100) : 0;
  const docxMediaId = sourceType === "docx" && videoId && videoId.length !== 11 ? videoId : null;

  return (
    <div className="page-grid">
      {/* Load panel */}
      <div className="card">
        <div className="subheading mb-12">Load content</div>
        <div className="mode-selector">
          {[
            { id: "youtube", label: "YouTube" },
            { id: "upload",  label: "Audio / Video" },
            { id: "docx",    label: "Word Doc" },
          ].map(({ id, label }) => (
            <button key={id} className={`mode-btn${inputMode === id ? " active" : ""}`}
              onClick={() => { setInputMode(id); resetState(); }}>
              {label}
            </button>
          ))}
        </div>

        {inputMode === "youtube" && (
          <div className="flex gap-8">
            <input
              type="text"
              placeholder="https://youtube.com/watch?v=…"
              value={videoUrl}
              onChange={e => setVideoUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLoadVideo()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={handleLoadVideo} disabled={loading} style={{ flexShrink: 0 }}>
              {loading ? <><span className="spinner" /> Loading</> : "Load"}
            </button>
          </div>
        )}

        {inputMode === "upload" && (
          <div className={`upload-zone${drag ? " drag" : ""}`}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
          >
            <div className="upload-icon">🎬</div>
            <div className="upload-label">{loading ? "Uploading & transcribing…" : "Click or drag a file"}</div>
            <div className="upload-hint">{ALLOWED_MEDIA.join("  ")} · Max 50 MB</div>
            {loading && <div className="flex items-center gap-8 mt-12" style={{ justifyContent: "center" }}><span className="spinner" /><span className="caption">Whisper is transcribing…</span></div>}
            <input ref={fileRef} type="file" accept={ALLOWED_MEDIA.join(",")} style={{ display: "none" }} onChange={e => handleMediaUpload(e.target.files?.[0])} />
          </div>
        )}

        {inputMode === "docx" && (
          <div className={`upload-zone${drag ? " drag" : ""}`}
            onDragOver={e => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => docxRef.current?.click()}
          >
            <div className="upload-icon">📄</div>
            <div className="upload-label">{loading ? "Parsing document…" : "Click or drag a .docx file"}</div>
            <div className="upload-hint">Limit: {MAX_DOCX_WORDS.toLocaleString()} words · Max 50 MB</div>
            {loading && <div className="flex items-center gap-8 mt-12" style={{ justifyContent: "center" }}><span className="spinner" /><span className="caption">Building index…</span></div>}
            <input ref={docxRef} type="file" accept=".docx,.doc" style={{ display: "none" }} onChange={e => handleDocxUpload(e.target.files?.[0])} />
          </div>
        )}

        {docxMeta && inputMode === "docx" && (
          <div className="word-bar-wrap mt-12">
            <div className="word-bar-labels">
              <span>{docxMeta.word_count.toLocaleString()} words indexed</span>
              <span>{MAX_DOCX_WORDS.toLocaleString()} limit</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${wordPct}%`, background: wordPct > 85 ? "linear-gradient(90deg,#f59e0b,#ef4444)" : undefined }} />
            </div>
          </div>
        )}

        {error   && <div className="status-box status-error mt-12">⚠ {error}</div>}
        {warnMsg && <div className="status-box status-warn mt-12">⚡ {warnMsg}</div>}
      </div>

      {/* Analysis section */}
      {videoId && (
        <>
          {/* Meta header */}
          <div className="card card-sm">
            <div className="flex items-center justify-between flex-wrap gap-8">
              <div>
                <div className="subheading mb-4">Now analyzing</div>
                <div className="heading" style={{ fontSize: 16 }}>{videoTitle || "Untitled"}</div>
              </div>
              <div className="flex gap-8 flex-wrap">
                <span className="tag tag-accent">{sourceType === "youtube" ? "YouTube" : sourceType === "docx" ? "Word Doc" : "Upload"}</span>
                {sourceType !== "docx" && <span className="tag tag-teal">Timestamps</span>}
                {sourceType === "docx"  && <span className="tag tag-teal">Paragraph refs</span>}
                {docxMeta && <span className="tag tag-default">{docxMeta.word_count.toLocaleString()} words</span>}
              </div>
            </div>
          </div>

          {/* Player / Viewer */}
          {sourceType === "youtube" && <YouTubePlayer videoId={videoId} />}
          {sourceType === "upload"  && <MediaPlayer videoId={videoId} title={videoTitle} />}
          {sourceType === "docx" && docxMediaId && (
            <div style={{ height: 440, borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--bg-surface)", border: "1px solid var(--border)", display: "flex", flexDirection: "column" }}>
              <DocxViewer mediaId={docxMediaId} />
            </div>
          )}

          {/* Tabs */}
          <div className="card">
            <div className="tab-bar">
              {[
                { id: "ask",      label: "Ask AI" },
                { id: "chapters", label: "Chapters" },
                { id: "quiz",     label: "Quiz" },
              ].map(({ id, label }) => (
                <button key={id} className={`tab-btn${activeTab === id ? " active" : ""}`} onClick={() => setActiveTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            {activeTab === "ask"      && <AskQuestion
  videoData={videoData}
  user={user}             
  convId={convId}
  onConvCreated={onConvCreated}
  onConvUpdated={onConvUpdated}
 />}
            {activeTab === "chapters" && <Chapters    videoData={videoData} />}
            {activeTab === "quiz"     && <Quiz        videoData={videoData} />}
          </div>
        </>
      )}

      {!videoId && (
        <div className="card">
          <div className="empty-state">
            <div className="empty-icon">◈</div>
            <div className="empty-title">Nothing loaded yet</div>
            <div className="empty-sub">Paste a YouTube link, upload a file, or drop a document above.</div>
          </div>
        </div>
      )}
    </div>
  );
}