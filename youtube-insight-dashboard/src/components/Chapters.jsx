import React, { useState } from "react";

const Chapters = ({ videoData }) => {
  const videoId = videoData?.videoId || "";
  const sourceType = videoData?.sourceType || "youtube";

  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadChapters = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`http://127.0.0.1:8000/chapters/${videoId}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setChapters(data.chapters || []);
    } catch (err) {
      console.error("Error loading chapters:", err);
      setError("Failed to load chapters. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleChapterClick = (startTime) => {
    if (sourceType === "youtube") {
      window.open(`https://www.youtube.com/watch?v=${videoId}&t=${startTime}s`, "_blank");
      return;
    }

    window.dispatchEvent(
      new CustomEvent("knowitfast:timestamp", {
        detail: { seconds: startTime, videoId },
      }),
    );
  };

  return (
    <div className="glass-card pad-lg">
      <div className="card-row" style={{ marginBottom: 16 }}>
        <div className="chip">Smart chapters</div>
        <div className="chip">
          {sourceType === "youtube" ? "YouTube" : "Uploaded media"}
        </div>
      </div>

      <button className="btn-primary load-chapters-btn" onClick={loadChapters} disabled={loading}>
        {loading ? (
          <>
            <span className="spinner" style={{ marginRight: 8 }} />
            Loading Chapters...
          </>
        ) : (
          "Load Chapters"
        )}
      </button>

      {error && (
        <div className="status-box error" style={{ marginTop: 14 }}>
          ⚠️ <span>{error}</span>
        </div>
      )}

      {chapters.length > 0 && (
        <div className="chapters-list" style={{ marginTop: 16 }}>
          {chapters.map((chapter, idx) => (
            <div
              key={idx}
              className="chapter-item"
              onClick={() => handleChapterClick(chapter.start_time)}
              style={{ cursor: "pointer", padding: 16 }}
            >
              <div className="card-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div className="chip">{idx + 1}</div>
                  <div>
                    <div className="chapter-title">{chapter.title}</div>
                    <div className="chapter-time text-secondary">{chapter.timestamp}</div>
                  </div>
                </div>
                <div style={{ fontSize: 18, color: "var(--accent-cyan)" }}>→</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && chapters.length === 0 && !error && (
        <div className="empty-card" style={{ marginTop: 16 }}>
          <div className="empty-icon">📑</div>
          <p>No chapters loaded yet. Click the button above.</p>
        </div>
      )}
    </div>
  );
};

export default Chapters;