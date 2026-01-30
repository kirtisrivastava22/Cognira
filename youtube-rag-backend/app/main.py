from fastapi import FastAPI
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from app.rag import ask_youtube_video, build_rag_chain,get_or_create_vectorstore,split_documents,load_youtube_docs,llm

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
        return {
            "answer": answer,
            "video_id": req.video_id
        }

        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    

from fastapi.responses import StreamingResponse
import json
import time

@app.post("/ask_stream")
def ask_stream(req: AskRequest):

    def token_generator():
        print("generator started", flush=True)

        # 1️⃣ ACK immediately
        yield "data: " + json.dumps({"type": "status", "value": "started"}) + "\n\n"

        db = get_or_create_vectorstore(
            req.video_id,
            docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
        )

        if db is None:
            yield "data: " + json.dumps({
                "type": "answer",
                "value": "I don't know. No transcript available."
            }) + "\n\n"
            return

        retriever = db.as_retriever(search_kwargs={"k": 6})
        docs = retriever.invoke(req.question)

        if not docs:
            yield "data: " + json.dumps({
                "type": "answer",
                "value": "I don't know"
            }) + "\n\n"
            return

        # 2️⃣ Timestamp first
        ts = docs[0].metadata.get("start", 0)
        mm, ss = divmod(ts, 60)

        yield "data: " + json.dumps({
            "type": "timestamp",
            "value": {
                "seconds": ts,
                "display": f"{mm:02d}:{ss:02d}"
            }
        }) + "\n\n"

        # 3️⃣ Stream tokens
        chain = build_rag_chain(llm, retriever)

        for token in chain.stream(req.question):
            yield "data: " + json.dumps({
                "type": "token",
                "value": token
            }) + "\n\n"

        # 4️⃣ End
        yield "data: " + json.dumps({"type": "end"}) + "\n\n"

    return StreamingResponse(
        token_generator(),
        media_type="text/event-stream"
    )

from app.chapters import detect_chapters

@app.get("/chapters/{video_id}")
def get_chapters(video_id: str):
    """Get auto-detected chapters"""
    return detect_chapters(video_id)