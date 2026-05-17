import React, { useState, useEffect, useRef, useCallback } from "react";
import AskQuestion from "./AskQuestion";
import Chapters from "./Chapters";
import Quiz from "./Quiz";

/* ─────────────────────────────────────────────────────────────────────────────
   MediaPlayer
   • YouTube  → <iframe> with YouTube IFrame API (postMessage seekTo)
   • Upload   → <video>  with direct currentTime seek
   ───────────────────────────────────────────────────────────────────────────── */
const MediaPlayer = ({ videoData }) => {
  const mediaRef = useRef(null);

  if (!videoData) return null;

  // YouTube
  if (videoData.sourceType === "youtube") {
    return (
      <iframe
        width="100%"
        height="400"
        src={`https://www.youtube.com/embed/${videoData.videoId}?enablejsapi=1`}
        allow="autoplay; encrypted-media"
        allowFullScreen
        title="YouTube player"
        style={{ border: "none", borderRadius: 12 }}
      />
    );
  }

  const mediaUrl = `http://127.0.0.1:8000/media/${videoData.videoId}`;

  const title = videoData.title?.toLowerCase() || "";

  const isAudio =
    title.endsWith(".mp3") ||
    title.endsWith(".wav") ||
    title.endsWith(".m4a");

  // AUDIO PLAYER
  if (isAudio) {
    return (
      <audio
        ref={mediaRef}
        controls
        style={{
          width: "100%",
          marginTop: 20,
        }}
      >
        <source src={mediaUrl} />
      </audio>
    );
  }

  // VIDEO PLAYER
  return (
    <video
      ref={mediaRef}
      controls
      width="100%"
      style={{
        borderRadius: 12,
      }}
    >
      <source src={mediaUrl} />
    </video>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   DocxViewer — elite document reader
   • Paragraph-level navigation + persistent glow highlight from [para N] clicks
   • Inline search with match count and prev/next navigation
   • Reading-progress bar at top
   • Paragraph number gutter
   • Detects heading-style paragraphs (short, title-case) and renders them larger
   ───────────────────────────────────────────────────────────────────────────── */
const DocxViewer = ({ mediaId }) => {
  const [paragraphs,    setParagraphs]    = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [searchQuery,   setSearchQuery]   = useState("");
  const [matchIndex,    setMatchIndex]    = useState(0);
  const [activeParaIdx, setActiveParaIdx] = useState(-1);
  const [scrollPct,     setScrollPct]     = useState(0);

  const paraRefs   = useRef([]);
  const scrollRef  = useRef(null);
  const activeTimer = useRef(null);

  // ── Fetch document ────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(`http://127.0.0.1:8000/doc/${mediaId}`)
      .then((r) => r.json())
      .then((data) => {
        const paras = (data.text || "").split(/\n\n+/).filter((p) => p.trim().length > 0);
        setParagraphs(paras);
      })
      .catch(() => setParagraphs(["⚠️ Failed to load document."]))
      .finally(() => setLoading(false));
  }, [mediaId]);

  // ── Scroll progress ───────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const pct = el.scrollHeight - el.clientHeight > 0
        ? Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100)
        : 0;
      setScrollPct(pct);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [loading]);

  // ── Navigate to paragraph (from AI answer [para N] click) ────────────────
  const goToParagraph = (idx) => {
    const el = paraRefs.current[idx];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveParaIdx(idx);
    // Clear previous timer
    if (activeTimer.current) clearTimeout(activeTimer.current);
    activeTimer.current = setTimeout(() => setActiveParaIdx(-1), 3000);
  };

  useEffect(() => {
    const handler = (e) => {
      const idx = Number(e.detail?.paragraph ?? -1);
      if (idx >= 0) goToParagraph(idx);
    };
    window.addEventListener("knowitfast:paragraph", handler);
    return () => window.removeEventListener("knowitfast:paragraph", handler);
  }, []);

  // ── Search: collect all match positions ──────────────────────────────────
  const searchMatches = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    const hits = [];
    paragraphs.forEach((p, pi) => {
      let start = 0;
      const lower = p.toLowerCase();
      while (true) {
        const pos = lower.indexOf(q, start);
        if (pos === -1) break;
        hits.push({ pi, pos });
        start = pos + 1;
      }
    });
    return hits;
  }, [searchQuery, paragraphs]);

  // Reset match index when query changes
  useEffect(() => { setMatchIndex(0); }, [searchQuery]);

  // Jump to current match
  useEffect(() => {
    if (!searchMatches.length) return;
    const m = searchMatches[matchIndex];
    if (m) goToParagraph(m.pi);
  }, [matchIndex, searchMatches]);

  // ── Render paragraph text with search highlights ─────────────────────────
  const renderText = (text, paraIdx) => {
    if (!searchQuery.trim()) return text;
    const q = searchQuery.toLowerCase();
    const parts = [];
    let remaining = text;
    let offset = 0;

    while (true) {
      const pos = remaining.toLowerCase().indexOf(q);
      if (pos === -1) { parts.push(remaining); break; }
      if (pos > 0) parts.push(remaining.slice(0, pos));

      // Is this the currently-focused match?
      const globalIdx = searchMatches.findIndex(
        (m) => m.pi === paraIdx && m.pos === offset + pos
      );
      const isFocused = globalIdx === matchIndex;

      parts.push(
        <mark
          key={`${paraIdx}-${pos}`}
          style={{
            background: isFocused ? "rgba(250,204,21,0.55)" : "rgba(250,204,21,0.22)",
            color: "#fff",
            borderRadius: 3,
            padding: "0 2px",
            boxShadow: isFocused ? "0 0 0 2px rgba(250,204,21,0.6)" : "none",
          }}
        >
          {remaining.slice(pos, pos + q.length)}
        </mark>
      );
      offset += pos + q.length;
      remaining = remaining.slice(pos + q.length);
    }
    return parts;
  };

  // ── Heuristic: is this paragraph a heading? ───────────────────────────────
  const isHeading = (text) => {
    const trimmed = text.trim();
    return (
      trimmed.length < 80 &&
      trimmed.length > 2 &&
      !/[.!?]$/.test(trimmed) &&       // doesn't end in sentence punctuation
      /^[A-Z0-9]/.test(trimmed)        // starts with capital or number
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "8px 12px",
        background: "rgba(255,255,255,0.03)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        flexShrink: 0,
      }}>
        {/* Search box */}
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 13, opacity: 0.4 }}>🔍</span>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in document…"
            style={{
              width: "100%", boxSizing: "border-box",
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "6px 10px 6px 30px",
              color: "#fff", fontSize: 13, outline: "none",
            }}
          />
        </div>

        {/* Match count + prev/next */}
        {searchQuery.trim() && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
              {searchMatches.length > 0 ? `${matchIndex + 1} / ${searchMatches.length}` : "No matches"}
            </span>
            {searchMatches.length > 0 && <>
              <button
                onClick={() => setMatchIndex((i) => (i - 1 + searchMatches.length) % searchMatches.length)}
                style={navBtnStyle}
              >↑</button>
              <button
                onClick={() => setMatchIndex((i) => (i + 1) % searchMatches.length)}
                style={navBtnStyle}
              >↓</button>
            </>}
          </div>
        )}

        {/* Spacer + stats */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
            {paragraphs.length} paragraphs
          </span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", whiteSpace: "nowrap" }}>
            {scrollPct}% read
          </span>
        </div>
      </div>

      {/* ── Reading progress bar ── */}
      <div style={{ height: 2, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
        <div style={{
          height: "100%",
          width: `${scrollPct}%`,
          background: "linear-gradient(90deg, #7c3aed, #06b6d4)",
          transition: "width 0.2s",
        }} />
      </div>

      {/* ── Document body ── */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflowY: "auto", padding: "24px 20px 32px",
          scrollBehavior: "smooth",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", paddingTop: 40, color: "rgba(255,255,255,0.35)" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
            Loading document…
          </div>
        ) : (
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            {paragraphs.map((p, i) => {
              const heading = isHeading(p);
              const isActive = activeParaIdx === i;
              return (
                <div
                  key={i}
                  ref={(el) => (paraRefs.current[i] = el)}
                  style={{
                    display: "flex",
                    gap: 14,
                    marginBottom: heading ? 20 : 12,
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: isActive
                      ? "rgba(124,58,237,0.18)"
                      : "transparent",
                    boxShadow: isActive
                      ? "0 0 0 1px rgba(124,58,237,0.45), 0 0 18px rgba(124,58,237,0.15)"
                      : "none",
                    transition: "background 0.5s, box-shadow 0.5s",
                  }}
                >
                  {/* Paragraph number gutter */}
                  <span style={{
                    flexShrink: 0,
                    width: 28,
                    paddingTop: heading ? 4 : 2,
                    fontSize: 10,
                    fontFamily: "'SF Mono','Fira Code',monospace",
                    color: isActive ? "rgba(167,139,250,0.8)" : "rgba(255,255,255,0.18)",
                    textAlign: "right",
                    userSelect: "none",
                    transition: "color 0.4s",
                  }}>
                    {i + 1}
                  </span>

                  {/* Left accent bar for active paragraph */}
                  <div style={{
                    width: 2,
                    flexShrink: 0,
                    borderRadius: 1,
                    background: isActive
                      ? "linear-gradient(180deg,#7c3aed,#06b6d4)"
                      : "transparent",
                    transition: "background 0.4s",
                  }} />

                  {/* Paragraph content */}
                  {heading ? (
                    <h3 style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 700,
                      color: isActive ? "#e9d5ff" : "rgba(255,255,255,0.92)",
                      lineHeight: 1.5,
                      letterSpacing: "0.01em",
                    }}>
                      {renderText(p, i)}
                    </h3>
                  ) : (
                    <p style={{
                      margin: 0,
                      fontSize: 14,
                      lineHeight: 1.8,
                      color: isActive ? "#f5f3ff" : "rgba(255,255,255,0.72)",
                      transition: "color 0.4s",
                    }}>
                      {renderText(p, i)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Inline styles */}
      <style>{`
        input::placeholder { color: rgba(255,255,255,0.25) !important; }
        input:focus { border-color: rgba(124,58,237,0.5) !important; box-shadow: 0 0 0 3px rgba(124,58,237,0.15); }
      `}</style>
    </div>
  );
};

// Small reusable nav button style (defined outside so it doesn't re-create on every render)
const navBtnStyle = {
  background: "rgba(255,255,255,0.07)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "rgba(255,255,255,0.6)",
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 12,
  cursor: "pointer",
  lineHeight: 1,
};

/* ─────────────────────────────────────────────────────────────────────────────
   Styles (unchanged from original)
   ───────────────────────────────────────────────────────────────────────────── */
const S = {
  inputPanel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  tabBar: {
    display: "flex",
    gap: 8,
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    paddingBottom: 2,
    marginBottom: 18,
  },
  uploadZone: (drag) => ({
    border: `2px dashed ${drag ? "#7c3aed" : "rgba(255,255,255,0.15)"}`,
    borderRadius: 12,
    padding: "28px 20px",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color 0.2s, background 0.2s",
    background: drag ? "rgba(124,58,237,0.08)" : "rgba(255,255,255,0.02)",
    position: "relative",
  }),
  pill: (active) => ({
    padding: "5px 16px",
    borderRadius: 999,
    border: "1px solid",
    borderColor: active ? "#7c3aed" : "rgba(255,255,255,0.12)",
    background: active ? "rgba(124,58,237,0.18)" : "transparent",
    color: active ? "#c4b5fd" : "rgba(255,255,255,0.5)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  }),
  inputTypeBtn: (active) => ({
    flex: 1,
    padding: "10px 8px",
    borderRadius: 10,
    border: "1px solid",
    borderColor: active ? "#7c3aed" : "rgba(255,255,255,0.08)",
    background: active ? "rgba(124,58,237,0.15)" : "rgba(255,255,255,0.03)",
    color: active ? "#e9d5ff" : "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
    textAlign: "center",
    letterSpacing: "0.03em",
  }),
  metaChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 999,
    background: "rgba(124,58,237,0.12)",
    border: "1px solid rgba(124,58,237,0.25)",
    color: "#c4b5fd",
    fontSize: 12,
    fontWeight: 500,
  },
  statusBadge: (type) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 10,
    background:
      type === "error"
        ? "rgba(239,68,68,0.1)"
        : type === "warn"
          ? "rgba(234,179,8,0.1)"
          : "rgba(124,58,237,0.1)",
    border: `1px solid ${
      type === "error"
        ? "rgba(239,68,68,0.3)"
        : type === "warn"
          ? "rgba(234,179,8,0.3)"
          : "rgba(124,58,237,0.25)"
    }`,
    color:
      type === "error" ? "#fca5a5" : type === "warn" ? "#fde047" : "#c4b5fd",
    fontSize: 13,
  }),
  wordBar: (pct) => ({
    height: 4,
    borderRadius: 2,
    background: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    marginTop: 6,
  }),
  wordFill: (pct) => ({
    height: "100%",
    width: `${pct}%`,
    borderRadius: 2,
    background:
      pct > 85
        ? "linear-gradient(90deg,#f59e0b,#ef4444)"
        : "linear-gradient(90deg,#7c3aed,#06b6d4)",
    transition: "width 0.4s",
  }),
};

const MAX_DOCX_WORDS = 20_000;
const ALLOWED_VIDEO_AUDIO = [".mp4", ".mp3", ".wav", ".mkv", ".m4a", ".webm"];
const ALLOWED_DOC = [".docx", ".doc"];

function extractYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
  } catch {}
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main component
   ───────────────────────────────────────────────────────────────────────────── */
const VideoAnalysis = ({
  currentVideo,
  setCurrentVideo,
  addToHistory,
  isSignedIn,
  user,
  onOpenAuth,
}) => {
  const [activeTab,   setActiveTab]   = useState("ask");
  const [inputMode,   setInputMode]   = useState("youtube");
  const [videoUrl,    setVideoUrl]    = useState("");
  const [videoId,     setVideoId]     = useState("");
  const [videoTitle,  setVideoTitle]  = useState("");
  const [sourceType,  setSourceType]  = useState("youtube");
  const [error,       setError]       = useState("");
  const [warnMsg,     setWarnMsg]     = useState("");
  const [loading,     setLoading]     = useState(false);
  const [docxMeta,    setDocxMeta]    = useState(null);
  const [drag,        setDrag]        = useState(false);

  const fileInputRef = useRef(null);
  const docxInputRef = useRef(null);

  /* Sync from parent (history navigation) */
  useEffect(() => {
    if (!currentVideo) return;
    setVideoId(currentVideo.videoId || "");
    setVideoTitle(currentVideo.title || "");
    setSourceType(currentVideo.sourceType || "youtube");
    setInputMode(
      currentVideo.sourceType === "docx"
        ? "docx"
        : currentVideo.sourceType === "upload"
          ? "upload"
          : "youtube",
    );
    if ((currentVideo.sourceType || "youtube") === "youtube") {
      setVideoUrl(`https://www.youtube.com/watch?v=${currentVideo.videoId}`);
    }
  }, [currentVideo]);

  /* ── YouTube load ─────────────────────────────────────────────────────── */
  const handleLoadVideo = async () => {
    setError("");
    setWarnMsg("");
    setDocxMeta(null);
    const id = extractYouTubeId(videoUrl);
    if (!id) {
      setError("Please enter a valid YouTube URL.");
      return;
    }

    setVideoId(id);
    setSourceType("youtube");
    setLoading(true);
    try {
      const res  = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`,
      );
      const data  = await res.json();
      const title = data.title || "Unknown Video";
      setVideoTitle(title);
      const videoData = {
        videoId: id,
        title,
        timestamp: new Date().toISOString(),
        sourceType: "youtube",
      };
      setCurrentVideo(videoData);
      addToHistory(videoData);
    } catch {
      setVideoTitle("Unknown Video");
    } finally {
      setLoading(false);
    }
  };

  /* ── Generic file ingest (audio / video) ─────────────────────────────── */
  const handleMediaUpload = async (file) => {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_VIDEO_AUDIO.includes(ext)) {
      setError(`Unsupported file type "${ext}". Allowed: ${ALLOWED_VIDEO_AUDIO.join(", ")}`);
      return;
    }
    setError(""); setWarnMsg(""); setDocxMeta(null);
    setVideoTitle(file.name);
    setSourceType("upload");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res  = await fetch("http://127.0.0.1:8000/ingest", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      const mediaData = {
        videoId:    data.media_id,
        title:      data.title || file.name,
        timestamp:  new Date().toISOString(),
        sourceType: data.source_type || "upload",
      };
      setVideoId(data.media_id);
      setVideoTitle(mediaData.title);
      setCurrentVideo(mediaData);
      addToHistory(mediaData);
      setActiveTab("ask");
    } catch (err) {
      setError("Upload failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── DOCX ingest ──────────────────────────────────────────────────────── */
  const handleDocxUpload = async (file) => {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_DOC.includes(ext)) {
      setError("Only .docx / .doc files are accepted here.");
      return;
    }
    setError(""); setWarnMsg(""); setDocxMeta(null);
    setVideoTitle(file.name);
    setSourceType("docx");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res  = await fetch("http://127.0.0.1:8000/ingest", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setDocxMeta({ word_count: data.word_count, truncated: data.truncated });
      if (data.truncated) {
        setWarnMsg(
          `Document was trimmed to ${MAX_DOCX_WORDS.toLocaleString()} words to stay within the analysis limit.`,
        );
      }

      const mediaData = {
        videoId:    data.media_id,
        title:      data.title || file.name,
        timestamp:  new Date().toISOString(),
        sourceType: "docx",
        wordCount:  data.word_count,
      };
      setVideoId(data.media_id);
      setVideoTitle(mediaData.title);
      setCurrentVideo(mediaData);
      addToHistory(mediaData);
      setActiveTab("ask");
    } catch (err) {
      setError("Document upload failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Drag-and-drop ────────────────────────────────────────────────────── */
  const onDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (ALLOWED_DOC.includes(ext)) {
      setInputMode("docx");
      handleDocxUpload(file);
    } else {
      setInputMode("upload");
      handleMediaUpload(file);
    }
  };

  const sourceLabel =
    sourceType === "youtube"
      ? "YouTube"
      : sourceType === "docx"
        ? "Word Document"
        : "Uploaded media";

  const wordPct = docxMeta
    ? Math.round((docxMeta.word_count / MAX_DOCX_WORDS) * 100)
    : 0;

  const playerData = videoId ? { videoId, sourceType } : null;

  // Only pass a mediaId to DocxViewer when we are certain it came from /ingest
  // (i.e. sourceType is confirmed "docx"). This prevents a YouTube video ID from
  // being sent to /doc/ when sourceType and videoId states are briefly out of sync.
  const docxMediaId =
    sourceType === "docx" &&
    videoId &&
    // YouTube IDs are exactly 11 chars; /ingest media_ids are 12-char hex strings.
    // Double-check by excluding anything that looks like a YouTube ID.
    videoId.length !== 11
      ? videoId
      : null;

  return (
    <div className="section-grid">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="glass-card hero-card">
        <div className="hero-badge">
          <span>KnowItFast analysis workspace</span>
        </div>
        <h1 className="hero-title">
          <span className="hero-title-text">Analyze, ask, and jump</span>
        </h1>
        <p className="hero-subtitle">
          Paste a YouTube URL, upload audio/video, or drop a Word document.
          KnowItFast builds transcript intelligence and turns long content into answers.
        </p>
        <div className="hero-actions" style={{ alignItems: "center" }}>
          {!isSignedIn && (
            <button className="btn-secondary" onClick={onOpenAuth}>
              Sign in to save history
            </button>
          )}
          <div className="chip good">
            <span>●</span>
            <span>{isSignedIn ? `Synced as ${user?.name || "user"}` : "Guest mode"}</span>
          </div>
          {videoId && <div style={S.metaChip}>{sourceLabel}</div>}
        </div>
      </div>

      {/* ── Load content panel ────────────────────────────────────────────── */}
      <div className="glass-card pad-lg">
        <h2 className="section-title" style={{ marginBottom: 16 }}>Load content</h2>

        {/* Input-type selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {[
            { id: "youtube", label: "▶  YouTube" },
            { id: "upload",  label: "🎵  Audio / Video" },
            { id: "docx",    label: "📄  Word Doc" },
          ].map(({ id, label }) => (
            <button
              key={id}
              style={S.inputTypeBtn(inputMode === id)}
              onClick={() => { setInputMode(id); setError(""); setWarnMsg(""); }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── YouTube ── */}
        {inputMode === "youtube" && (
          <div style={S.inputPanel}>
            <p className="text-secondary" style={{ margin: 0 }}>
              Paste a YouTube URL and press Load — the transcript is fetched automatically.
            </p>
            <div className="input-row" style={{ flexWrap: "wrap", gap: 8 }}>
              <input
                type="text"
                className="input-field video-url-input"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLoadVideo()}
                style={{ flex: 1, minWidth: 220 }}
              />
              <button className="btn-primary" onClick={handleLoadVideo} disabled={loading}>
                {loading ? "Loading…" : "Load video"}
              </button>
            </div>
          </div>
        )}

        {/* ── Audio / Video ── */}
        {inputMode === "upload" && (
          <div style={S.inputPanel}>
            <p className="text-secondary" style={{ margin: 0 }}>
              Upload an audio or video file. Whisper transcribes it server-side — no YouTube needed.
              <br />
              <span style={{ fontSize: 12, opacity: 0.6 }}>
                Supported: {ALLOWED_VIDEO_AUDIO.join("  ")} · Max 50 MB
              </span>
            </p>
            <div
              style={S.uploadZone(drag)}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎬</div>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
                {loading ? "Uploading…" : "Click or drag & drop a file here"}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_VIDEO_AUDIO.join(",")}
                style={{ display: "none" }}
                onChange={(e) => handleMediaUpload(e.target.files?.[0])}
              />
            </div>
          </div>
        )}

        {/* ── DOCX ── */}
        {inputMode === "docx" && (
          <div style={S.inputPanel}>
            <p className="text-secondary" style={{ margin: 0 }}>
              Upload a <strong>.docx</strong> Word document. No transcription needed — the text is
              parsed directly and indexed for Q&amp;A, chapters, and quiz generation.
              <br />
              <span style={{ fontSize: 12, opacity: 0.6 }}>
                Limit: {MAX_DOCX_WORDS.toLocaleString()} words · Max 50 MB
              </span>
            </p>
            <div
              style={S.uploadZone(drag)}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              onClick={() => docxInputRef.current?.click()}
            >
              <div style={{ fontSize: 36, marginBottom: 8 }}>📝</div>
              <p style={{ margin: 0, color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
                {loading ? "Processing document…" : "Click or drag & drop a .docx file"}
              </p>
              <input
                ref={docxInputRef}
                type="file"
                accept=".docx,.doc"
                style={{ display: "none" }}
                onChange={(e) => handleDocxUpload(e.target.files?.[0])}
              />
            </div>
            {docxMeta && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>
                  <span>{docxMeta.word_count.toLocaleString()} words indexed</span>
                  <span>{MAX_DOCX_WORDS.toLocaleString()} word limit</span>
                </div>
                <div style={S.wordBar(wordPct)}>
                  <div style={S.wordFill(wordPct)} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Errors / Warnings */}
        {error   && <div style={{ ...S.statusBadge("error"), marginTop: 12 }}>⚠️ {error}</div>}
        {warnMsg && <div style={{ ...S.statusBadge("warn"),  marginTop: 12 }}>⚡ {warnMsg}</div>}
      </div>

      {/* ── Analysis area ─────────────────────────────────────────────────── */}
      {videoId && (
        <>
          {/* Header */}
          <div className="video-header glass-card">
            <div className="video-header-content">
              <div className="video-details">
                <h2 style={{ margin: 0 }}>Analysis ready</h2>
                <p className="video-title-display" style={{ margin: "6px 0 0 0" }}>
                  {videoTitle || "Loading…"}
                </p>
              </div>
            </div>
            <div className="card-row">
              <div style={S.metaChip}>{sourceLabel}</div>
              {sourceType === "youtube" && <div style={S.metaChip}> Timestamps enabled</div>}
              {sourceType === "docx"    && <div style={S.metaChip}> Page refs enabled</div>}
              {sourceType === "upload"  && <div style={S.metaChip}> Whisper transcript</div>}
              {docxMeta && <div style={S.metaChip}>{docxMeta.word_count.toLocaleString()} words</div>}
            </div>
          </div>

          {/* Player / Viewer */}
          <div className="video-player-container">
            {(sourceType === "youtube" || sourceType === "upload") && (
              <div className="video-player">
                <MediaPlayer videoData={playerData} />
              </div>
            )}
            {sourceType === "docx" && docxMediaId && (
              <div style={{
                height: 480,
                borderRadius: 12,
                overflow: "hidden",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)",
                display: "flex",
                flexDirection: "column",
              }}>
                <DocxViewer mediaId={docxMediaId} />
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="tabs-section glass-card pad-lg">
            <div style={S.tabBar}>
              {["ask", "chapters", "quiz"].map((t) => (
                <button key={t} style={S.pill(activeTab === t)} onClick={() => setActiveTab(t)}>
                  {t === "ask" ? "Ask Question" : t === "chapters" ? "Chapters" : "Quiz"}
                </button>
              ))}
            </div>
            <div className="tab-content">
              {activeTab === "ask"      && <AskQuestion videoData={currentVideo || { videoId, sourceType }} />}
              {activeTab === "chapters" && <Chapters    videoData={currentVideo || { videoId, sourceType }} />}
              {activeTab === "quiz"     && <Quiz        videoData={currentVideo || { videoId, sourceType }} />}
            </div>
          </div>

          {/* Tips */}
          <div className="tips-box glass-card pad-lg">
            <h3 style={{ marginTop: 0 }}>💡 Tips</h3>
            <ul className="tips-list">
              <li>Ask specific questions for more precise answers.</li>
              {sourceType === "youtube" && (
                <li>Click any <strong>[mm:ss]</strong> timestamp in an answer to jump to that moment.</li>
              )}
              {sourceType === "docx" && (
                <li>Click any <strong>[para N]</strong> reference to locate the passage in your document.</li>
              )}
              {sourceType === "upload" && (
                <li>Click any <strong>[mm:ss]</strong> reference to seek the video to that moment.</li>
              )}
              <li>Use the Chapters tab to get a structured breakdown of the content.</li>
              <li>Generate a Quiz to test your understanding instantly.</li>
              {isSignedIn
                ? <li>Your history is saved and synced across devices.</li>
                : <li>Sign in to keep your history across devices.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default VideoAnalysis;