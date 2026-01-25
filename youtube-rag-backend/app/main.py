from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.rag import ask_youtube_video

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    video_id: str
    question: str

@app.post("/ask")
def ask(req: AskRequest):
    try:
        if not req.video_id or not req.question:
            raise HTTPException(status_code=400, detail="Missing fields")
        answer = ask_youtube_video(req.video_id, req.question)
        return {"answer": answer}
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    
    
