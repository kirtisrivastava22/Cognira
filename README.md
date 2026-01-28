🎥 YouTube Chat Extension (RAG-powered)

Ask questions about any YouTube video and get grounded answers with clickable timestamps, powered by Retrieval-Augmented Generation (RAG).

This project consists of:

🧩 A Chrome Extension UI

⚙️ A FastAPI backend for transcript processing + LLM inference
🧠 A RAG pipeline using vector search over video transcripts

✨ Features

🔍 Ask natural language questions about YouTube videos
🧠 Answers generated only from the video transcript (no hallucinations)
⏱️ Clickable timestamps → jump directly to the relevant moment in the video
⚡ Streaming responses (answers appear token-by-token)
📜 Automatic transcript fetching (supports English & auto-generated captions)
🧩 Modular backend (easy to swap models later)

🏗️ Project Structure
Youtube-Chat-Extension/
│
├── youtube-rag-extension/     # Chrome Extension
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   └── manifest.json
│
├── youtube-rag-backend/       # FastAPI Backend
│   ├── app/
│   │   ├── main.py            # API routes
│   │   ├── rag.py             # RAG pipeline
│   │   ├── vectorstore.py     # FAISS vector store
│   │   └── youtube.py         # Transcript loading
│   └── requirements.txt
│
└── README.md

🧠 How It Works (High-Level)

Chrome Extension
Detects current YouTube video ID
Sends { video_id, question } to backend
Streams the answer and renders timestamps
Backend (FastAPI)
Fetches YouTube transcript
Splits transcript into chunks
Embeds chunks using sentence-transformers
Stores & retrieves via FAISS
Generates answer using an LLM

Returns:
Answer text
Earliest relevant timestamp

Video ID
RAG Guardrails
If the transcript doesn’t contain the answer → returns “I don’t know”
Prevents hallucination by strict prompt rules

🚀 Getting Started
1️⃣ Clone the Repository
git clone https://github.com/kirtisrivastava22/Youtube-Chat-Extension.git
cd Youtube-Chat-Extension

2️⃣ Backend Setup (FastAPI)
cd youtube-rag-backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt


Run the backend:
uvicorn app.main:app --reload


Backend runs at:

http://127.0.0.1:8000
3️⃣ Chrome Extension Setup

Open Chrome

Go to: chrome://extensions
Enable Developer Mode
Click Load unpacked
Select the youtube-rag-extension/ folder

🧪 Example Usage

Open any YouTube video with captions
Click the extension icon

Ask:
What are the main types of databases?


Receive:
A concise answer
A clickable timestamp that jumps to the exact explanation

🛠️ Tech Stack
Frontend

Chrome Extension (HTML, CSS, JavaScript)
Backend
FastAPI
LangChain
FAISS (Vector Store)
sentence-transformers
YouTube Transcript API
LLM
Pluggable (local or hosted)
Designed for easy upgrades later

🧩 Characterstics

Implements Retrieval-Augmented Generation
Uses real-time streaming responses
Demonstrates LLM guardrails against hallucinations
Integrates browser extensions + ML backend
Clean separation of concerns (UI, API, RAG, storage)

🔮 Planned Enhancements

Multiple timestamp citations per answer
Highlight transcript text on YouTube page
Cloud deployment (free tier)
Model comparison & latency optimizations
Support for non-English transcripts

