# 🎥 YouTube Chat Extension (RAG-powered)

Ask questions about **any YouTube video** and get **grounded, timestamped answers** — with one-click jump-to-video support — powered by **Retrieval-Augmented Generation (RAG)**.

This project combines a **Chrome Extension UI** with a **FastAPI backend** and a **vector-based RAG pipeline**, designed to be fast, reliable, and hallucination-free.

---

## ✨ Key Features

- 🔍 Ask natural-language questions about YouTube videos  
- 🧠 Answers strictly grounded in the video transcript  
- ⏱️ Clickable timestamps → jump directly to the relevant moment  
- ⚡ Real-time streaming answers (token-by-token)  
- 📜 Automatic transcript fetching (manual + auto-generated captions)  
- 🚫 Hallucination guardrails → returns **“I don’t know”** when unsupported  
- 🧠 Transcript caching → prevents YouTube API rate-limiting  
- 🧩 Modular backend → easy model / vector DB swaps  
- 📝 PDF export with real YouTube title & channel name  
- 🧪 Auto-generated quizzes & chapters  

---

## 🧠 Architecture Overview

### 🧩 Chrome Extension
- Detects current YouTube video ID  
- Sends `{ video_id, question }` to backend  
- Streams answers live  
- Renders **clickable timestamps**  
- Seeks the YouTube player programmatically  

### ⚙️ FastAPI Backend
- Fetches & **caches transcripts** (API hit only once per video)  
- Splits transcript into chunks  
- Embeds chunks  
- Stores vectors in FAISS  
- Retrieves relevant chunks per query  
- Streams LLM output  

### 🧠 RAG Guardrails
- Answers generated **only from retrieved transcript chunks**  
- If transcript doesn’t support the answer → returns **“I don’t know”**  
- Prevents hallucinations by design  

---

## 🚦 Rate-Limit Fix (Important)

**Problem**  
Each feature (Ask, Quiz, Chapters, PDF) originally called the YouTube Transcript API independently, causing frequent **rate limiting**.

**Solution**  
A **transcript caching layer** was added.

### ✅ How it works
- Transcript is fetched **once per video**
- Normalized and saved locally
- All features reuse the cached transcript
- API is never called again for the same video

### ✅ Benefits
- 🚀 Faster responses  
- 🔒 No rate-limit crashes  
- ⏱️ Deterministic timestamps  
- 🧠 Single source of truth  

---

## 🏗️ Project Structure

Youtube-Chat-Extension/
│
├── youtube-rag-extension/ # Chrome Extension
│ ├── popup.html
│ ├── popup.js
│ ├── popup.css
│ └── manifest.json
│
├── youtube-rag-backend/ # FastAPI Backend
│ ├── app/
│ │ ├── main.py # API routes + streaming
│ │ ├── rag.py # RAG pipeline
│ │ ├── vectorstore.py # FAISS vector store
│ │ ├── transcript_cache.py # Transcript caching
│ │ ├── chapters.py # Chapter detection
│ │ ├── quiz.py # Quiz generation
│ │ └── export.py # PDF export
│ └── requirements.txt
│
└── README.md


---

## 🚀 Getting Started (Local Setup)

### 1️⃣ Clone the Repository
git clone https://github.com/kirtisrivastava22/Youtube-Chat-Extension.git
cd Youtube-Chat-Extension

2️⃣ Backend Setup (FastAPI + Groq)
cd youtube-rag-backend
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r requirements.txt

🔑 Set Groq API Key
export GROQ_API_KEY=your_api_key_here

The backend uses Groq (Llama-3.1) for ultra-low-latency streaming responses.

▶️ Run Backend
uvicorn app.main:app --reload


Backend runs at:
http://127.0.0.1:8000

3️⃣ Chrome Extension Setup
Open Chrome
Go to chrome://extensions
Enable Developer Mode
Click Load unpacked
Select youtube-rag-extension/

🧪 Example Usage
Open a YouTube video with captions
Click the extension

Ask:
Why is a reverse proxy used here?
✅ You get:

A concise transcript-grounded answer
A clickable timestamp
Instant jump to the exact explanation

🛠️ Tech Stack
Frontend
Chrome Extension
HTML, CSS, JavaScript
YouTube Player DOM control
Backend
FastAPI
LangChain
FAISS (Vector Store)
YouTube Transcript API
LLM
Groq (Llama-3.1)
Streaming enabled
Model-agnostic architecture

🧩 Project Characteristics

Retrieval-Augmented Generation (RAG)
Real-time streaming UX
Explicit hallucination prevention
Transcript-anchored timestamps
Rate-limit-safe design
Clean separation of concerns

🔮 Planned Enhancements

Multiple timestamp citations per answer
Transcript highlighting inside YouTube page
Cloud deployment (free tier)
Model comparison & latency benchmarks

⭐ Why This Project Matters

This project demonstrates:
Practical RAG implementation
Real-world rate-limit handling
Browser extension + ML backend integration
Streaming LLM UX
Guardrails against hallucinations
