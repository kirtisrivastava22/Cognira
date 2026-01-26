const askBtn = document.getElementById("ask");
const questionInput = document.getElementById("question");
const statusContainer = document.getElementById("status-container");
const answerContainer = document.getElementById("answer-container");
const tipsBox = document.getElementById("tips");

// Focus question input on popup open
questionInput.focus();

// Handle Enter key (Shift+Enter for new line)
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

  // Clear previous results
  answerContainer.innerHTML = "";
  tipsBox.classList.add("hidden");
  askBtn.disabled = true;
  
  showStatus("Detecting video...", false);

  try {
    // Get current YouTube tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    const url = new URL(tab.url);
    const videoId = url.searchParams.get("v");

    if (!videoId) {
      showStatus("Not a YouTube video. Please open a YouTube video first.", true);
      askBtn.disabled = false;
      return;
    }

    showStatus("Analyzing transcript...", false);

    // Call backend
    const res = await fetch("http://127.0.0.1:8000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        video_id: videoId, 
        question: question 
      })
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    
    console.log("Backend response:", data); // Debug log
    
    // Clear status
    statusContainer.innerHTML = "";
    
    // Display answer with timestamp
    displayAnswer(data, videoId);

  } catch (error) {
    console.error("Error:", error);
    showStatus("Backend not ready. Make sure FastAPI is running on http://127.0.0.1:8000", true);
    answerContainer.innerHTML = `
      <div class="answer-box">
        <div style="color: #fca5a5; font-size: 13px;">
          <strong>Connection Error</strong><br><br>
          Make sure your FastAPI backend is running:<br>
          <code style="background: #1f2937; padding: 2px 6px; border-radius: 4px; font-size: 11px;">
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
    ? `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
         <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
       </svg>`
    : `<div class="spinner"></div>`;

  statusContainer.innerHTML = `
    <div class="status-box ${className}">
      ${icon}
      <span>${message}</span>
    </div>
  `;
}

function displayAnswer(data, videoId) {
  // Handle different response formats
  let answerText = "";
  let timestamp = null;
  let timestampDisplay = null;
  
  // Case 1: New format with structured response
  if (typeof data === 'object' && data.answer) {
    answerText = String(data.answer);
    timestamp = data.timestamp;
    timestampDisplay = data.timestamp_display;
    videoId = data.video_id || videoId;
  } 
  // Case 2: Old format with just answer string
  else if (typeof data === 'string') {
    answerText = data;
    // Try to extract timestamp from string like "(01:23)"
    const match = answerText.match(/\((\d{2}):(\d{2})\)\s*$/);
    if (match) {
      timestampDisplay = `${match[1]}:${match[2]}`;
      timestamp = parseInt(match[1]) * 60 + parseInt(match[2]);
      answerText = answerText.replace(/\s*\(\d{2}:\d{2}\)\s*$/, '');
    }
  }

  // Check if answer indicates "I don't know"
  const noAnswer = answerText.toLowerCase().includes("i don't know") || 
                   answerText.toLowerCase().includes("i do not know") ||
                   answerText.toLowerCase().includes("does not contain");

  if (noAnswer || timestamp === null || timestamp === undefined) {
    answerContainer.innerHTML = `
      <div class="answer-box">
        <div class="answer-header">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
          <span>Response</span>
        </div>
        <div class="answer-content">
          ${escapeHtml(answerText)}
        </div>
      </div>
    `;
    return;
  }

  const timestampHTML = timestamp !== null && timestampDisplay
    ? `<a 
         href="https://www.youtube.com/watch?v=${videoId}&t=${timestamp}s" 
         target="_blank" 
         class="timestamp-link"
       >
         <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
           <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
         </svg>
         Jump to ${timestampDisplay}
       </a>`
    : '';

  answerContainer.innerHTML = `
    <div class="answer-box">
      <div class="answer-header">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <span>Answer</span>
      </div>
      <div class="answer-content">
        ${escapeHtml(answerText)}
        ${timestampHTML}
      </div>
    </div>
  `;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}