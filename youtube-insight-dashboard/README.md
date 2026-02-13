# YouTube Insight Assistant - React Dashboard

A beautiful, AI-powered YouTube video analysis dashboard built with React. This web application mirrors the design and functionality of the Chrome extension, providing an intuitive interface for analyzing YouTube videos with advanced AI capabilities.

![YouTube Insight Assistant](https://img.shields.io/badge/React-18.2.0-blue) ![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Features

### 🤖 AI-Powered Question Answering
- Ask questions about any YouTube video
- Get real-time streaming answers from AI
- Click on timestamps to jump to relevant video moments
- Inline timestamp navigation

### 📑 Smart Chapter Navigation
- Automatically detect and load video chapters
- Navigate through video sections with ease
- Click chapters to jump to specific timestamps

### ✅ Interactive Quizzes
- Generate AI-powered quizzes based on video content
- 5-question multiple-choice format
- Instant feedback and explanations
- Score tracking and review

### 📄 Export & History
- Export comprehensive notes as PDF
- Track all analyzed videos in history
- Search through past videos
- Organized by date (Today, Yesterday, This Week, Older)

### 🎨 Beautiful Design
- Gradient color scheme matching the extension
- Smooth animations and transitions
- Responsive layout for all screen sizes
- Dark-themed sidebar with gradient background

## 🚀 Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- FastAPI backend running (see Backend Setup below)

### Installation

1. **Clone or extract the project:**
```bash
cd youtube-insight-dashboard
```

2. **Install dependencies:**
```bash
npm install
```

3. **Start the development server:**
```bash
npm start
```

The app will open at [http://localhost:3000](http://localhost:3000)

### Backend Setup

This dashboard requires the FastAPI backend to be running. Make sure your backend is set up and running on `http://127.0.0.1:8000`.

To start the backend:
```bash
cd backend
uvicorn app.main:app --reload
```

## 📁 Project Structure

```
youtube-insight-dashboard/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Sidebar.jsx           # Navigation sidebar
│   │   ├── Sidebar.css
│   │   ├── Dashboard.jsx         # Main dashboard page
│   │   ├── Dashboard.css
│   │   ├── VideoAnalysis.jsx     # Video analysis page with tabs
│   │   ├── VideoAnalysis.css
│   │   ├── AskQuestion.jsx       # Q&A tab component
│   │   ├── AskQuestion.css
│   │   ├── Chapters.jsx          # Chapters tab component
│   │   ├── Chapters.css
│   │   ├── Quiz.jsx              # Quiz tab component
│   │   ├── Quiz.css
│   │   ├── History.jsx           # Video history page
│   │   ├── History.css
│   │   ├── Settings.jsx          # Settings page
│   │   └── Settings.css
│   ├── App.jsx                   # Main app component with routing
│   ├── App.css                   # Global app styles
│   ├── index.jsx                 # React entry point
│   └── index.css                 # Global CSS reset
├── package.json
└── README.md
```

## 🎯 Usage

### Analyzing a Video

1. Navigate to **Analyze Video** from the sidebar
2. Paste a YouTube video URL in the input field
3. Click **Load Video** to start analysis
4. Use the tabs to:
   - **Ask Question**: Query the video content
   - **Chapters**: Navigate through video sections
   - **Quiz**: Test your understanding

### Asking Questions

1. Type your question in the text area
2. Press Enter or click **Ask Question**
3. Watch the AI generate a streaming response
4. Click on timestamps to jump to relevant moments

### Taking Quizzes

1. Click **Generate Quiz** to create a 5-question quiz
2. Select your answers for each question
3. Click **Submit Quiz** to see your score
4. Review correct answers and explanations

### Managing History

1. Navigate to **History** from the sidebar
2. Search through analyzed videos
3. Click any video to analyze it again
4. Clear history or export to JSON

### Configuring Settings

1. Navigate to **Settings** from the sidebar
2. Update backend URL if needed
3. Configure default preferences
4. Manage data and export history

## 🎨 Design System

The dashboard uses the same beautiful design system as the extension:

### Color Palette
- **Primary Gradient**: `#dd677b` → `#85285d`
- **Background**: `#e3f2f7` → `#becedb`
- **Accent**: `#f5d8be`

### Typography
- **Primary Font**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- **Headings**: 800 weight, gradient colors
- **Body**: 400-600 weight

### Components
- Rounded corners (14-18px border-radius)
- Smooth shadows with color tinting
- Hover animations and transitions
- Consistent spacing and padding

## 🔧 Configuration

### Backend URL

Update the backend URL in Settings or directly in the code:

```javascript
// src/components/AskQuestion.jsx, Chapters.jsx, Quiz.jsx
const BACKEND_URL = 'http://127.0.0.1:8000';
```

### localStorage

The app uses localStorage for:
- Video history
- User settings
- Preferences

Data persists across sessions and can be exported/cleared from Settings.

## 📦 Building for Production

```bash
npm run build
```

This creates an optimized production build in the `build/` folder.

To serve the production build:
```bash
npm install -g serve
serve -s build
```

## 🌐 Deployment

### Deploy to Netlify

1. Build the project: `npm run build`
2. Drag the `build/` folder to Netlify
3. Update backend URL in Settings to point to your production API

### Deploy to Vercel

```bash
npm install -g vercel
vercel
```

### Deploy to GitHub Pages

1. Install gh-pages: `npm install --save-dev gh-pages`
2. Add to package.json:
```json
"homepage": "https://yourusername.github.io/youtube-insight-dashboard",
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d build"
}
```
3. Deploy: `npm run deploy`

## 🛠️ Tech Stack

- **Frontend Framework**: React 18.2
- **Routing**: React Router DOM 6.20
- **Styling**: Pure CSS (no frameworks)
- **Backend**: FastAPI (separate project)
- **AI**: LangChain + RAG

## 📝 API Endpoints

The dashboard communicates with the following backend endpoints:

- `POST /ask_stream` - Streaming Q&A responses
- `GET /chapters/{video_id}` - Load video chapters
- `GET /quiz/{video_id}` - Generate quiz questions
- `POST /export/pdf` - Export notes as PDF

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with React and FastAPI
- Powered by LangChain and RAG technology
- Design inspired by modern web applications
- YouTube API for video metadata

## 📞 Support

For issues or questions:
- Open an issue on GitHub
- Check the backend is running on the correct port
- Verify CORS settings in the backend

## 🔮 Future Enhancements

- [ ] Dark mode theme
- [ ] Multi-language support
- [ ] Collaborative features
- [ ] Video collections/playlists
- [ ] Advanced search filters
- [ ] Video comparison tool
- [ ] Custom quiz difficulty levels
- [ ] Social sharing features

---

**Made with ❤️ using React, FastAPI, and LangChain**
