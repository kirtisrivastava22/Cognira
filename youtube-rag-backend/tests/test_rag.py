from app.rag import ask_youtube_video

def test_rag_returns_answer():
    result = ask_youtube_video("dummy_video", "What is this about?")
    
    assert result is not None
    assert "answer" in result