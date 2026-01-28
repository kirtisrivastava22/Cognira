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

@app.post("/ask_stream")
def ask_stream(req: AskRequest):
    print("went", flush=True)

    def token_generator():
        print("generator started", flush=True)

        # 🚀 SEND ACK IMMEDIATELY
        yield json.dumps({"status": "started"}) + "\n"

        db = get_or_create_vectorstore(
            req.video_id,
            docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
        )
        
        if db is None:
            yield json.dumps({
                "answer": "I don't know. This video does not have usable transcripts."
            })
            return
        print("vector store created")
        retriever = db.as_retriever(search_kwargs={"k": 6})
        docs = retriever.invoke(req.question)
        print("Retriver invoked")
        
        if not docs:
            yield json.dumps({"answer": "I don't know"})
            return
        print("Docs to hai bhai")
        top_doc = docs[0]
        ts = top_doc.metadata.get("start", 0)
        mm, ss = divmod(ts, 60)

        yield json.dumps({
            "timestamp": ts,
            "timestamp_display": f"{mm:02d}:{ss:02d}"
        }) + "\n---\n"

        chain = build_rag_chain(llm, retriever)
        print("chain build")
        for chunk in chain.stream(req.question):
            yield chunk

        # ✅ END STREAM
        yield "\n ... \n"

    return StreamingResponse(token_generator(), media_type="text/plain")
