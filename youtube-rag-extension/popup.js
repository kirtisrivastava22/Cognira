const askBtn = document.getElementById("ask");
const status = document.getElementById("status");
const loader = document.getElementById("loader");
const answerBox = document.getElementById("answer");

askBtn.onclick = async () => {
  answerBox.textContent = "";
  status.textContent = "Detecting video...";
  askBtn.disabled = true;
  loader.classList.remove("hidden");

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const videoId = new URL(tab.url).searchParams.get("v");

  if (!videoId) {
    status.textContent = "Not a YouTube video";
    loader.classList.add("hidden");
    askBtn.disabled = false;
    return;
  }

  const question = document.getElementById("question").value.trim();
  if (!question) {
    status.textContent = "Enter a question";
    loader.classList.add("hidden");
    askBtn.disabled = false;
    return;
  }

  status.textContent = "Thinking…";

  try {
    const res = await fetch("http://127.0.0.1:8000/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, question })
    });

    const data = await res.json();
    answerBox.textContent = data.answer || "No answer";
    status.textContent = "Done";
  } catch (e) {
    status.textContent = "Backend not ready";
    answerBox.textContent = "Make sure FastAPI is running.";
  }

  loader.classList.add("hidden");
  askBtn.disabled = false;
};
