# 🦉 Cognira — Turn any content into clarity.

Paste a YouTube URL, upload audio or video, or drop a Word document. Cognira builds transcript intelligence and gives you instant answers, chapters, quizzes, and exportable notes.

> An AI-powered content intelligence platform — users can query any video, audio, or document using RAG with hybrid retrieval and get cited, hallucination-guarded answers.
Cognira isn’t just a chatbot — it’s a thinking layer over content.

---

## Overview

Cognira is a full-stack conversational AI system designed to deliver **fast, context-aware, and persistent chat experiences**.

Unlike basic chat apps, Cognira focuses on:
-  **Low-latency interactions**
-  **Context preservation across conversations**
-  **Structured conversation management**
-  **Shareable AI conversations**

## Features

- Context-aware Q&A over transcripts
- Timestamp-grounded answers
- CRAG (Corrective Retrieval Augmented Generation)
- Hallucination rejection ("I don't know" fallback)
- LLM-agnostic architecture (Groq, OpenAI, Ollama)
- Fast retrieval (<250ms latency)


##  Key Features

###  **Intelligent Q&A System**
- **RAG-powered**: Uses vector embeddings and semantic search
- **Streaming responses**: Real-time token-by-token answers
- **Inline citations**: Clickable timestamps for source verification
- **Context-aware**: Retrieves only relevant transcript segments

###  **Smart Chapter Detection**
- Automatic video segmentation using transcript analysis
- One-click navigation to video sections
- Time-stamped chapter markers

###  **AI-Generated Quizzes**
- Dynamic question generation (3-10 questions)
- Multiple-choice format with explanations
- Instant grading and performance feedback

###  **PDF Export**
- Comprehensive notes with Q&A history
- Formatted summaries and key takeaways
- Shareable study materials

###  **Multi-Platform**
- **Web Dashboard**: Full-featured React application
- **REST API**: Programmatic access for developers

---

##  Architecture
User Query
↓
Retriever (BM25 / Vector)
↓
CRAG (Relevance Check + Correction)
↓
LLM (Answer Generation)
↓
Structured Output (Answer + Timestamps + Scores)

##  Tech Stack

### **Backend**
- **FastAPI** - High-performance async API framework
- **LangChain** - LLM orchestration and RAG pipeline
- **FAISS** - Vector similarity search
- **Groq** - Ultra-fast LLM inference (Llama 3.1)
- **youtube-transcript-api** - Transcript extraction
- **ReportLab** - PDF generation

### **Frontend**
- **React 18** - UI framework with hooks
- **React Router** - Client-side routing
- **Streaming API** - Server-Sent Events for real-time responses
- **LocalStorage** - Client-side data persistence

##  Quick Start

### **Prerequisites**
```bash
# System requirements
- Python 3.9+
- Node.js 14+
- Git
```

### **1. Clone Repository**
```bash
git clone https://github.com/kirtisrivastava22/Youtube-Insight-Assistant
cd youtube-insight-assistant
```

### **2. Backend Setup**
```bash
cd youtube-rag-backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env and add your GROQ_API_KEY

# Run server
uvicorn app.main:app --reload
```

Server runs at: `http://127.0.0.1:8000`

### **3. Frontend Setup**
```bash
cd youtube-insight-dashboard

# Install dependencies
npm install

# Start development server
npm start
```

Dashboard opens at: `http://localhost:3000`

---

##  Performance Metrics

| Metric | Value |
|--------|-------|
| **Average Query Time** | 2-3 seconds |
| **Streaming Latency** | <500ms first token |
| **Transcript Processing** | ~1s per 10min video |
| **Vector Search** | <100ms for retrieval |
| **Quiz Generation** | 5-8 seconds for 5 questions |
| **PDF Export** | <2 seconds |

## Using Different LLMs

### Cognira is LLM-agnostic — swap providers easily.

### Groq (Default — Fastest)
from langchain_groq import ChatGroq

llm = ChatGroq(
    model="llama-3.1-8b-instant",
    temperature=0
)
### OpenAI
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o-mini",
    temperature=0
)
### Local (Ollama)
from langchain_community.chat_models import ChatOllama

llm = ChatOllama(
    model="llama3",
    temperature=0
)
Evaluation Metrics
Results
{
  "total_questions": 44,
  "keyword_hit_rate": 0.932,
  "confidence_match_rate": 0.841,
  "avg_relevance_score": 0.605,
  "corrective_retry_count": 4,
  "avg_retrieval_latency_ms": 237.4
}

##  Use Cases

### **1. Students**
- Study video lectures efficiently
- Generate practice quizzes
- Export notes for revision
- Navigate to specific topics quickly

### **2. Researchers**
- Analyze conference talks
- Extract key insights from seminars
- Cross-reference multiple videos
- Create annotated bibliographies

### **3. Content Creators**
- Analyze competitor content
- Extract talking points
- Generate video summaries
- Create educational materials

### **4. Educators**
- Create assessments from video content
- Verify student comprehension
- Develop study guides
- Curate educational resources

---

##  Project Structure

```
cognira/
├── youtube-rag-backend/          # FastAPI backend
│   ├── app/
│   │   ├── main.py              # API endpoints
│   │   ├── rag.py               # RAG pipeline
│   │   ├── quiz.py              # Quiz generation
│   │   ├── chapters.py          # Chapter detection
│   │   ├── export.py            # PDF export
│   │   ├── vectorstore.py       # FAISS management
│   │   └── transcript_cache.py  # Caching layer
│   ├── requirements.txt
│   └── .env.example
│
├── youtube-insight-dashboard/    # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── VideoAnalysis.jsx
│   │   │   ├── AskQuestion.jsx
│   │   │   ├── Chapters.jsx
│   │   │   ├── Quiz.jsx
│   │   │   ├── History.jsx
│   │   │   └── Settings.jsx
│   │   ├── App.jsx
│   │   └── index.jsx
│   ├── package.json
│   └── README.md
│
│
├── docs/                         # Documentation
│   ├── API.md
│   ├── DEPLOYMENT.md
│   └── CONTRIBUTING.md
│
├── tests/                        # Test suite
│   ├── test_rag.py
│   ├── test_quiz.py
│   └── test_api.py
│
├── README.md
├── LICENSE
└── .gitignore
```

---

##  Testing

```bash
# Run backend tests
cd youtube-rag-backend
pytest tests/ -v

# Run frontend tests
cd youtube-insight-dashboard
npm test

# API endpoint testing
http://127.0.0.1:8000/docs
```

---

##  Security & Privacy

-  No user data stored on servers
-  Transcripts cached locally only
-  API keys secured with environment variables
-  CORS configured for specific origins
-  Rate limiting on all endpoints

---

##  Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## Future Roadmap

- [ ] **Multiple input format** for docx
- [ ] **Voice input** for questions
- [ ] **Playlist analysis** for course series

## Acknowledgments

- [LangChain](https://langchain.com) for RAG framework
- [Groq](https://groq.com) for fast LLM inference
- [FAISS](https://github.com/facebookresearch/faiss) for vector search
- [FastAPI](https://fastapi.tiangolo.com) for backend framework

 Final Thought

Cognira isn’t just a chatbot — it’s a thinking layer over content.

If you like this project, ⭐ the repo and share it!
