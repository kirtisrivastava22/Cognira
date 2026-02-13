# YouTube Insight Assistant - Quick Start Guide

## 🚀 Get Started in 3 Steps

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start Backend (Required)
Make sure your FastAPI backend is running:
```bash
cd ../backend
uvicorn app.main:app --reload
```

The backend should be running at: http://127.0.0.1:8000

### Step 3: Start Dashboard
```bash
npm start
```

The dashboard will open at: http://localhost:3000

## ✅ First Time Setup Checklist

- [ ] Node.js installed (v14+)
- [ ] npm or yarn installed
- [ ] Backend API running on port 8000
- [ ] CORS enabled in backend for localhost:3000
- [ ] Browser console open to check for errors

## 🎯 Testing the Dashboard

1. **Navigate to Analyze Video**
2. **Paste a YouTube URL** (e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ)
3. **Click Load Video**
4. **Try each feature:**
   - Ask a question
   - Load chapters
   - Generate a quiz
   - Export as PDF

## 🐛 Common Issues

### "Failed to connect to backend"
**Solution**: Make sure FastAPI is running on http://127.0.0.1:8000

### "CORS Error"
**Solution**: Add this to your FastAPI backend:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Video not loading
**Solution**: Check that the YouTube URL is valid and the video is public

### No chapters found
**Solution**: Not all videos have chapters. Try a different video.

## 📚 Learn More

- Read the full README.md for detailed documentation
- Check out the component files in src/components/
- Explore the backend API documentation at http://127.0.0.1:8000/docs

## 💡 Pro Tips

1. **Use keyboard shortcuts**: Press Enter in question input to submit
2. **History is saved**: All analyzed videos are stored in localStorage
3. **Export your data**: Use Settings to export your video history
4. **Multiple tabs**: Open the dashboard in multiple tabs to compare videos

## 🎨 Customization

Want to customize the design? Check out:
- `src/App.css` - Global styles and color scheme
- `src/components/*.css` - Individual component styles
- Color variables are defined at the top of each CSS file

## 📞 Need Help?

- Check the browser console for error messages
- Verify the backend is responding: http://127.0.0.1:8000/docs
- Open an issue on GitHub with error details

---

**Happy analyzing! 🎉**
