import React, { useState, useRef, useEffect } from "react";
import "./AskQuestion.css";

const AskQuestion = ({ videoData }) => {
  const videoId = videoData?.videoId || "";
  const sourceType = videoData?.sourceType || "youtube";

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const answerRef = useRef(null);

  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
    }
  }, [answer]);

  const handleAsk = async () => {
    if (!question.trim()) {
      setError("Please enter a question");
      return;
    }

    setAnswer("");
    setError("");
    setIsLoading(true);
    setStatus("Analyzing transcript...");

    try {
      const response = await fetch("http://127.0.0.1:8000/ask_stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      setStatus("Generating answer...");

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop();

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;

          const payload = JSON.parse(event.slice(6));

          switch (payload.type) {
            case "status":
              setStatus(payload.value);
              break;

            case "token": {
              const text = payload.value;
              const formatted = text.replace(
                /\[(\d{2}):(\d{2})\]/g,
                (match, mm, ss) => {
                  const seconds = parseInt(mm) * 60 + parseInt(ss);
                  return `<span class="inline-ts" data-time="${seconds}">${match}</span>`;
                },
              );
              setAnswer((prev) => prev + formatted);
              break;
            }

            case "correction":
              setAnswer(payload.value);
              break;

            case "end":
              setStatus("");
              setIsLoading(false);
              break;

            default:
              break;
          }
        }
      }
    } catch (err) {
      console.error("Error:", err);
      setError(
        "Failed to connect to backend. Make sure the server is running on http://127.0.0.1:8000",
      );
      setIsLoading(false);
      setStatus("");
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const handleTimestampClick = (seconds) => {
    if (sourceType === "youtube") {
      window.open(`https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`, "_blank");
      return;
    }

    window.dispatchEvent(
      new CustomEvent("knowitfast:timestamp", {
        detail: { seconds, videoId },
      }),
    );
  };

  const handleExportDOCX = async () => {
    try {
      setStatus("Generating DOCX...");

      const response = await fetch(
        `http://127.0.0.1:8000/export/docx?video_id=${videoId}`,
        { method: "POST" },
      );

      if (!response.ok) {
        throw new Error("Failed to export DOCX");
      }

      const buffer = await response.arrayBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;

      let filename = `${videoId}_notes.docx`;
      const disposition = response.headers.get("Content-Disposition");

      if (disposition && disposition.includes("filename=")) {
        filename = disposition.split("filename=")[1].replace(/"/g, "");
      }

      a.download = filename;
      document.body.appendChild(a);
      a.click();

      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatus("");
    } catch (err) {
      console.error("Export error:", err);
      setError("Failed to export DOCX");
      setStatus("");
    }
  };

  return (
    <div className="glass-card pad-lg">
      <div className="card-row" style={{ marginBottom: 16 }}>
        <div className="chip">Ask AI</div>
        <div className="chip">
          {sourceType === "youtube" ? "YouTube" : "Uploaded media"}
        </div>
      </div>

      <div className="input-group">
        <label htmlFor="question-input" className="section-title" style={{ display: "block" }}>
          Your Question
        </label>
        <textarea
          id="question-input"
          className="textarea-field"
          rows="4"
          placeholder="What is this content about? Ask anything..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={isLoading}
        />
      </div>

      <div className="hero-actions" style={{ marginTop: 14 }}>
        <button className="btn-primary" onClick={handleAsk} disabled={isLoading}>
          {isLoading ? (
            <>
              <span className="spinner" style={{ marginRight: 8 }} />
              Analyzing...
            </>
          ) : (
            "Ask Question"
          )}
        </button>

        <button className="btn-secondary" onClick={handleExportDOCX}>
           Export Notes as DOCX
        </button>
      </div>

      {status && (
        <div className="status-box loading">
          <span className="spinner" />
          <span>{status}</span>
        </div>
      )}

      {error && (
        <div className="status-box error">
          ⚠️ <span>{error}</span>
        </div>
      )}

      {answer && (
        <div className="answer-box" style={{ marginTop: 16 }}>
          <div className="answer-header">
            <span className="section-title" style={{ margin: 0 }}>
              Answer
            </span>
          </div>

          <div
            className="answer-content"
            ref={answerRef}
            dangerouslySetInnerHTML={{ __html: answer }}
            onClick={(e) => {
              if (e.target.classList.contains("inline-ts")) {
                const seconds = parseInt(e.target.dataset.time, 10);
                handleTimestampClick(seconds);
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

export default AskQuestion;