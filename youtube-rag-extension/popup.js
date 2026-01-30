const askBtn = document.getElementById("ask");
const questionInput = document.getElementById("question");
const statusContainer = document.getElementById("status-container");
const answerContainer = document.getElementById("answer-container");
const tipsBox = document.getElementById("tips");

questionInput.focus();

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

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    let answerText = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop(); // keep incomplete chunk

      for (const event of events) {
        if (!event.startsWith("data: ")) continue;

        const payload = JSON.parse(event.replace("data: ", ""));

        if (payload.type === "status") {
          showStatus("Generating answer...", false);
        }

        if (payload.type === "timestamp") {
          const { seconds, display } = payload.value;
          tsEl.innerHTML = `
          <button id="jump-btn" class="timestamp-link">
            ⏱ Jump to ${display}
          </button>
        `;

          document.getElementById("jump-btn").onclick = async () => {
            const [tab] = await chrome.tabs.query({
              active: true,
              currentWindow: true,
            });

            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: (time) => {
                const video = document.querySelector("video");
                if (video) {
                  video.currentTime = time;
                  video.play();
                }
              },
              args: [seconds],
            });
          };
        }
        if (payload.type === "token") {
          answerText += payload.value;
          answerEl.textContent = answerText;
        }

        if (payload.type === "end") {
          showStatus("", false);
        }
      }
    }

  } catch (error) {
    showStatus("Backend not running on http://127.0.0.1:8000", true);
    console.error(error);

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
  if (!message) {
    statusContainer.innerHTML = "";
    return;
  }

  const className = isError ? "error" : "loading";
  const icon = isError ? "⚠️" : `<div class="spinner"></div>`;

  statusContainer.innerHTML = `
    <div class="status-box ${className}">
      ${icon}
      <span>${message}</span>
    </div>
  `;
}

// Add tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    // Update active tab button
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Show/hide content
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(`${tab}-tab`).classList.remove('hidden');
  });
});

// Load chapters
document.getElementById('load-chapters-btn').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const videoId = new URL(tab.url).searchParams.get("v");
  
  if (!videoId) {
    alert("Please open a YouTube video");
    return;
  }
  
  document.getElementById('chapters-list').innerHTML = '<div class="spinner"></div>';
  
  try {
    const res = await fetch(`http://127.0.0.1:8000/chapters/${videoId}`);
    const data = await res.json();
    
    if (data.error) {
      document.getElementById('chapters-list').innerHTML = 
        `<div class="error-msg">${data.error}</div>`;
      return;
    }
    
    const chaptersHTML = data.chapters.map(ch => `
      <div class="chapter-item" data-time="${ch.start_time}">
        <div class="chapter-title">${ch.title}</div>
        <div class="chapter-time">${ch.timestamp}</div>
      </div>
    `).join('');
    
    document.getElementById('chapters-list').innerHTML = chaptersHTML;
    
    // Make chapters clickable
    document.querySelectorAll('.chapter-item').forEach(item => {
      item.onclick = async () => {
        const time = parseInt(item.dataset.time);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (t) => {
            const video = document.querySelector('video');
            if (video) {
              video.currentTime = t;
              video.play();
            }
          },
          args: [time]
        });
      };
    });
    
  } catch (error) {
    document.getElementById('chapters-list').innerHTML = 
      '<div class="error-msg">Backend not running</div>';
  }
};