from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.rag import ask_youtube_video

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    video_id: str
    question: str

@app.post("/ask")
def ask(req: AskRequest):
    answer = ask_youtube_video(req.video_id, req.question)
    return {"answer": answer}
