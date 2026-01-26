const askBtn = document.getElementById("ask");
const questionInput = document.getElementById("question");
const statusContainer = document.getElementById("status-container");
const answerContainer = document.getElementById("answer-container");
const tipsBox = document.getElementById("tips");

// Focus input on popup open
questionInput.focus();

// Enter to submit (Shift+Enter = newline)
questionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    askBtn.click();
  }
});

askBtn.onclick = async () => {
  const question = questionInput.value.trim();
  if (!question) {
    showStatus("Please enter a question", true);
    return;
  }

  answerContainer.innerHTML = "";
  tipsBox.classList.add("hidden");
  askBtn.disabled = true;

  showStatus("Detecting video...", false);

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    const url = new URL(tab.url);
    const videoId = url.searchParams.get("v");

    if (!videoId) {
      showStatus("Please open a YouTube video first", true);
      askBtn.disabled = false;
      return;
    }

    showStatus("Analyzing transcript...", false);

    const res = await fetch("http://127.0.0.1:8000/ask_stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, question }),
    });

    statusContainer.innerHTML = "";

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    answerContainer.innerHTML = `
      <div class="answer-box">
        <div class="answer-header">
          <span>Answer</span>
        </div>
        <div class="answer-content" id="streamed-answer"></div>
        <div id="timestamp-container" style="margin-top:8px;"></div>
      </div>
    `;

    const answerEl = document.getElementById("streamed-answer");
    const tsEl = document.getElementById("timestamp-container");

    let buffer = "";
    let metadataParsed = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 🔥 Parse metadata FIRST
      if (!metadataParsed && buffer.includes("\n---\n")) {
        const [metaRaw, rest] = buffer.split("\n---\n");
        buffer = rest;
        metadataParsed = true;

        try {
          const meta = JSON.parse(metaRaw);

          if (meta.timestamp !== null) {
            tsEl.innerHTML = `
              <a 
                href="https://www.youtube.com/watch?v=${meta.video_id}&t=${meta.timestamp}s"
                target="_blank"
                class="timestamp-link"
              >
                ⏱ Jump to ${meta.timestamp_display}
              </a>
            `;
          }
        } catch (e) {
          console.error("Failed to parse metadata", e);
        }
      }

      // Stream answer text
      if (metadataParsed && buffer) {
        answerEl.textContent += buffer;
        buffer = "";
      }
    }

  } catch (error) {
    console.error(error);
    showStatus("Backend not running on http://127.0.0.1:8000", true);

    answerContainer.innerHTML = `
      <div class="answer-box">
        <div style="color:#fca5a5;font-size:13px">
          <strong>Connection Error</strong><br><br>
          Run backend with:<br>
          <code style="background:#1f2937;padding:4px;border-radius:4px">
            uvicorn app.main:app --reload
          </code>
        </div>
      </div>
    `;
  }

  askBtn.disabled = false;
};

function showStatus(message, isError = false) {
  const className = isError ? "error" : "loading";
  const icon = isError
    ? "⚠️"
    : `<div class="spinner"></div>`;

  statusContainer.innerHTML = `
    <div class="status-box ${className}">
      ${icon}
      <span>${message}</span>
    </div>
  `;
}
