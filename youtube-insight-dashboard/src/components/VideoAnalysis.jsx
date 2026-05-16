import React, { useState, useEffect, useRef } from "react";
import AskQuestion from "./AskQuestion";
import Chapters from "./Chapters";
import Quiz from "./Quiz";

/* ─────────────────────────────────────────────────────────────────────────────
   Inline styles — no external CSS dependency so the file is self-contained.
   The existing VideoAnalysis.css still applies for .glass-card, .btn-primary etc.
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
      type === "error"
        ? "#fca5a5"
        : type === "warn"
        ? "#fde047"
        : "#c4b5fd",
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
const ALLOWED_VIDEO_AUDIO = [
  ".mp4", ".mp3", ".wav", ".mkv", ".m4a", ".webm",
];
const ALLOWED_DOC = [".docx", ".doc"];

/* ─────────────────────────────────────────────────────────────────────────────
   Helper: extract YouTube ID
   ───────────────────────────────────────────────────────────────────────────── */
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
  const [activeTab, setActiveTab]     = useState("ask");
  const [inputMode, setInputMode]     = useState("youtube"); // youtube | upload | docx
  const [videoUrl, setVideoUrl]       = useState("");
  const [videoId, setVideoId]         = useState("");
  const [videoTitle, setVideoTitle]   = useState("");
  const [sourceType, setSourceType]   = useState("youtube");
  const [error, setError]             = useState("");
  const [warnMsg, setWarnMsg]         = useState("");
  const [loading, setLoading]         = useState(false);
  const [docxMeta, setDocxMeta]       = useState(null); // {word_count, truncated}
  const [drag, setDrag]               = useState(false);

  const fileInputRef   = useRef(null);
  const docxInputRef   = useRef(null);

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
        : "youtube"
    );
    if ((currentVideo.sourceType || "youtube") === "youtube") {
      setVideoUrl(`https://www.youtube.com/watch?v=${currentVideo.videoId}`);
    }
  }, [currentVideo]);

  /* ── YouTube load ───────────────────────────────────────────────────────── */
  const handleLoadVideo = async () => {
    setError(""); setWarnMsg(""); setDocxMeta(null);
    const id = extractYouTubeId(videoUrl);
    if (!id) { setError("Please enter a valid YouTube URL."); return; }

    setVideoId(id); setSourceType("youtube"); setLoading(true);
    try {
      const res  = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
      const data = await res.json();
      const title = data.title || "Unknown Video";
      setVideoTitle(title);
      const videoData = { videoId: id, title, timestamp: new Date().toISOString(), sourceType: "youtube" };
      setCurrentVideo(videoData); addToHistory(videoData);
    } catch {
      setVideoTitle("Unknown Video");
    } finally {
      setLoading(false);
    }
  };

  /* ── Generic file ingest (audio / video) ───────────────────────────────── */
  const handleMediaUpload = async (file) => {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_VIDEO_AUDIO.includes(ext)) {
      setError(`Unsupported file type "${ext}". Allowed: ${ALLOWED_VIDEO_AUDIO.join(", ")}`);
      return;
    }
    setError(""); setWarnMsg(""); setDocxMeta(null);
    setVideoTitle(file.name); setSourceType("upload"); setLoading(true);

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

  /* ── DOCX ingest ────────────────────────────────────────────────────────── */
  const handleDocxUpload = async (file) => {
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_DOC.includes(ext)) {
      setError(`Only .docx / .doc files are accepted here.`);
      return;
    }
    setError(""); setWarnMsg(""); setDocxMeta(null);
    setVideoTitle(file.name); setSourceType("docx"); setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res  = await fetch("http://127.0.0.1:8000/ingest", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      setDocxMeta({ word_count: data.word_count, truncated: data.truncated });
      if (data.truncated) {
        setWarnMsg(
          `Document was trimmed to ${MAX_DOCX_WORDS.toLocaleString()} words to stay within the analysis limit.`
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

  /* ── Drag-and-drop (drop zone for upload / docx panels) ────────────────── */
  const onDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (ALLOWED_DOC.includes(ext)) {
      setInputMode("docx"); handleDocxUpload(file);
    } else {
      setInputMode("upload"); handleMediaUpload(file);
    }
  };

  const sourceLabel = sourceType === "youtube"
    ? "YouTube"
    : sourceType === "docx"
    ? "Word Document"
    : "Uploaded media";

  const wordPct = docxMeta
    ? Math.round((docxMeta.word_count / MAX_DOCX_WORDS) * 100)
    : 0;

  return (
    <div className="section-grid">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="glass-card hero-card">
        <div className="hero-badge">
          <span>KnowItFast analysis workspace</span>
        </div>
        <h1 className="hero-title">
          <span className="gradient-text">Analyze, ask, and jump</span>
        </h1>
        <p className="hero-subtitle">
          Paste a YouTube URL, upload audio/video, or drop a Word document.
          KnowItFast builds transcript intelligence and turns long content into answers.
        </p>
        <div className="hero-actions" style={{ alignItems: "center" }}>
          {!isSignedIn && (
            <button className="btn-secondary" onClick={onOpenAuth}>Sign in to save history</button>
          )}
          <div className="chip good">
            <span>●</span>
            <span>{isSignedIn ? `Synced as ${user?.name || "user"}` : "Guest mode"}</span>
          </div>
          {videoId && <div style={S.metaChip}>📌 {sourceLabel}</div>}
        </div>
      </div>

      {/* ── Load content panel ───────────────────────────────────────────── */}
      <div className="glass-card pad-lg">
        <h2 className="section-title" style={{ marginBottom: 16 }}>Load content</h2>

        {/* Input-type selector */}
        <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
          {[
            { id: "youtube", label: "▶  YouTube" },
            { id: "upload",  label: "🎵  Audio / Video" },
            { id: "docx",    label: "📄  Word Doc" },
          ].map(({ id, label }) => (
            <button key={id} style={S.inputTypeBtn(inputMode === id)} onClick={() => { setInputMode(id); setError(""); setWarnMsg(""); }}>
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

            {/* Word-count bar shown after successful upload */}
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
        {error   && <div style={{ ...S.statusBadge("error"),  marginTop: 12 }}>⚠️ {error}</div>}
        {warnMsg && <div style={{ ...S.statusBadge("warn"),   marginTop: 12 }}>⚡ {warnMsg}</div>}
      </div>

      {/* ── Analysis area ────────────────────────────────────────────────── */}
      {videoId && (
        <>
          {/* Header */}
          <div className="video-header glass-card">
            <div className="video-header-content">
              <div className="video-icon">✨</div>
              <div className="video-details">
                <h2 style={{ margin: 0 }}>Analysis ready</h2>
                <p className="video-title-display" style={{ margin: "6px 0 0 0" }}>
                  {videoTitle || "Loading…"}
                </p>
              </div>
            </div>
            <div className="card-row">
              <div style={S.metaChip}>{sourceLabel}</div>
              {sourceType === "youtube" && <div style={S.metaChip}>⏱ Timestamps enabled</div>}
              {sourceType === "docx"    && <div style={S.metaChip}>📖 Page refs enabled</div>}
              {sourceType === "upload"  && <div style={S.metaChip}>🎙 Whisper transcript</div>}
              {docxMeta && <div style={S.metaChip}>{docxMeta.word_count.toLocaleString()} words</div>}
            </div>
          </div>

          {/* Player / placeholder */}
          <div className="video-player-container">
            {sourceType === "youtube" ? (
              <div className="video-player">
                <iframe
                  width="100%" height="100%"
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div style={{
                aspectRatio: "16/9",
                display: "grid",
                placeItems: "center",
                padding: 24,
                background: sourceType === "docx"
                  ? "linear-gradient(135deg, rgba(37,99,235,0.18), rgba(139,92,246,0.12))"
                  : "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(34,211,238,0.12))",
                textAlign: "center",
              }}>
                <div>
                  <div style={{ fontSize: 52, marginBottom: 10 }}>
                    {sourceType === "docx" ? "📄" : "📁"}
                  </div>
                  <h3 style={{ margin: 0 }}>
                    {sourceType === "docx" ? "Document ready" : "Uploaded media ready"}
                  </h3>
                  <p className="text-secondary" style={{ marginTop: 8, maxWidth: 340 }}>
                    {sourceType === "docx"
                      ? "Ask questions, generate chapters, and quiz yourself — all from your document."
                      : "Ask questions, generate chapters, and create quizzes from this session."}
                  </p>
                </div>
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
              {sourceType === "youtube" && <li>Click any <strong>[mm:ss]</strong> timestamp in an answer to jump to that moment.</li>}
              {sourceType === "docx"    && <li>Click any <strong>[para N]</strong> reference to locate the passage in your document.</li>}
              {sourceType === "upload"  && <li>Click any <strong>[mm:ss]</strong> reference to see the transcript position.</li>}
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