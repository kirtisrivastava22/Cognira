import React, { useState, useEffect } from "react";
import AskQuestion from "./AskQuestion";
import Chapters from "./Chapters";
import Quiz from "./Quiz";
import "./VideoAnalysis.css";

const VideoAnalysis = ({
  currentVideo,
  setCurrentVideo,
  addToHistory,
  isSignedIn,
  user,
  onOpenAuth,
}) => {
  const [activeTab, setActiveTab] = useState("ask");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [videoId, setVideoId] = useState("");
  const [sourceType, setSourceType] = useState("youtube");
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentVideo) {
      setVideoId(currentVideo.videoId || "");
      setVideoTitle(currentVideo.title || "");
      setSourceType(currentVideo.sourceType || "youtube");

      if ((currentVideo.sourceType || "youtube") === "youtube") {
        setVideoUrl(`https://www.youtube.com/watch?v=${currentVideo.videoId}`);
      } else {
        setVideoUrl("");
      }
    }
  }, [currentVideo]);

  const extractVideoId = (url) => {
    try {
      const urlObj = new URL(url);

      if (urlObj.hostname.includes("youtube.com")) {
        return urlObj.searchParams.get("v");
      }
      if (urlObj.hostname.includes("youtu.be")) {
        return urlObj.pathname.slice(1);
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleLoadVideo = async () => {
    setError("");

    const id = extractVideoId(videoUrl);
    if (!id) {
      setError("Please enter a valid YouTube video link.");
      return;
    }

    setVideoId(id);
    setSourceType("youtube");

    try {
      const response = await fetch(
        `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`,
      );
      const data = await response.json();

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
    } catch (err) {
      console.error("Failed to fetch video title:", err);
      setVideoTitle("Unknown Video");
    }
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setVideoTitle(file.name);
    setSourceType("upload");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://127.0.0.1:8000/ingest", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Upload failed");
      }

      const data = await res.json();

      const mediaData = {
        videoId: data.media_id,
        title: data.title || file.name,
        timestamp: new Date().toISOString(),
        sourceType: data.source_type || "upload",
      };

      setVideoId(data.media_id);
      setVideoTitle(mediaData.title);
      setCurrentVideo(mediaData);
      addToHistory(mediaData);
      setActiveTab("ask");
    } catch (err) {
      console.error(err);
      setError("Could not upload the file. Check the backend and try again.");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleLoadVideo();
    }
  };

  const sourceLabel =
    sourceType === "youtube"
      ? "YouTube"
      : sourceType === "upload"
      ? "Uploaded media"
      : "Media";

  return (
    <div className="section-grid">
      <div className="glass-card hero-card">
        <div className="hero-badge">
          
          <span>KnowItFast analysis workspace</span>
        </div>

        <h1 className="hero-title">
          <span className="gradient-text">Analyze, ask, and jump</span>
        </h1>

        <p className="hero-subtitle">
          Paste a YouTube URL or upload audio/video. KnowItFast extracts meaning, builds transcript intelligence, and turns long content into answers.
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
          {videoId && (
            <div className="chip">
              <span>Source</span>
              <strong>{sourceLabel}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="glass-card pad-lg">
        <h2 className="section-title">Load content</h2>

        <div className="section-grid" style={{ gap: 14 }}>
          <div className="glass-card pad-md">
            <p className="text-secondary" style={{ marginTop: 0 }}>
              Paste a YouTube URL
            </p>
            <div className="input-row" style={{ alignItems: "stretch", flexWrap: "wrap" }}>
              <input
                type="text"
                className="input-field video-url-input"
                placeholder="https://www.youtube.com/watch?v=..."
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                onKeyDown={handleKeyPress}
                style={{ flex: 1, minWidth: 240 }}
              />
              <button className="btn-primary" onClick={handleLoadVideo}>
                Load video
              </button>
            </div>
          </div>

          <div className="glass-card pad-md">
            <p className="text-secondary" style={{ marginTop: 0 }}>
              Or upload video/audio
            </p>
            <input
              type="file"
              className="input-field video-url-input"
              accept="video/*,audio/*"
              onChange={handleUpload}
            />
          </div>
        </div>

        {error && (
          <div className="status-box error">
            ⚠️ <span>{error}</span>
          </div>
        )}
      </div>

      {videoId && (
        <>
          <div className="video-header glass-card">
            <div className="video-header-content">
              <div className="video-icon">✨</div>
              <div className="video-details">
                <h2 style={{ margin: 0 }}>Analysis ready</h2>
                <p className="video-title-display" style={{ margin: "6px 0 0 0" }}>
                  {videoTitle || "Loading..."}
                </p>
              </div>
            </div>

            <div className="card-row">
              <div className="chip">{sourceLabel}</div>
              <div className="chip">
                {sourceType === "youtube" ? "Timestamp jump enabled" : "Transcript mode"}
              </div>
            </div>
          </div>

          <div className="video-player-container">
            {sourceType === "youtube" ? (
              <div className="video-player">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <div
                style={{
                  aspectRatio: "16 / 9",
                  display: "grid",
                  placeItems: "center",
                  padding: 24,
                  background:
                    "linear-gradient(135deg, rgba(139,92,246,0.18), rgba(34,211,238,0.12))",
                  textAlign: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: 48, marginBottom: 10 }}>📁</div>
                  <h3 style={{ margin: 0 }}>Uploaded media is ready</h3>
                  <p className="text-secondary" style={{ marginTop: 8 }}>
                    Ask questions, generate chapters, and create quizzes from this session.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="tabs-section glass-card pad-lg">
            <div className="tab-strip">
              <button
                className={`tab-chip ${activeTab === "ask" ? "active" : ""}`}
                onClick={() => setActiveTab("ask")}
              >
                Ask Question
              </button>
              <button
                className={`tab-chip ${activeTab === "chapters" ? "active" : ""}`}
                onClick={() => setActiveTab("chapters")}
              >
                Chapters
              </button>
              <button
                className={`tab-chip ${activeTab === "quiz" ? "active" : ""}`}
                onClick={() => setActiveTab("quiz")}
              >
                Quiz
              </button>
            </div>

            <div className="tab-content" style={{ marginTop: 18 }}>
              {activeTab === "ask" && <AskQuestion videoData={currentVideo || { videoId }} />}
              {activeTab === "chapters" && <Chapters videoData={currentVideo || { videoId }} />}
              {activeTab === "quiz" && <Quiz videoData={currentVideo || { videoId }} />}
            </div>
          </div>

          <div className="tips-box glass-card pad-lg">
            <h3 style={{ marginTop: 0 }}>💡 Tips</h3>
            <ul className="tips-list">
              <li>Ask specific questions for better answers.</li>
              <li>Click timestamps to jump to the relevant moment.</li>
              <li>Use upload mode for audio, lectures, podcasts, or saved videos.</li>
              <li>Sign in to keep your history across devices.</li>
            </ul>
          </div>
        </>
      )}
    </div>
  );
};

export default VideoAnalysis;