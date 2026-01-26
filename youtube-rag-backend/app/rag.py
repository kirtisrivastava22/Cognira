import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    pipeline,
    BitsAndBytesConfig
)

from langchain_huggingface import HuggingFacePipeline
from app.vectorstore import get_or_create_vectorstore

# def load_llm():
#     # Use at least 1.5B or 3B for better reasoning
#     MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"  # Changed from 0.5B
    
#     tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    
#     quant_config = BitsAndBytesConfig(
#         load_in_4bit=True,
#         bnb_4bit_compute_dtype=torch.float16,
#         bnb_4bit_use_double_quant=True,
#         bnb_4bit_quant_type="nf4"
#     )
    
#     model = AutoModelForCausalLM.from_pretrained(
#         MODEL_ID,
#         device_map="auto",
#         quantization_config=quant_config,
#         dtype=torch.float16
#     )
    
#     pipe = pipeline(
#         "text-generation",
#         model=model,
#         tokenizer=tokenizer,
#         max_new_tokens=256,
#         temperature=0.0,  # Changed to 0 for deterministic output
#         do_sample=False,
#         return_full_text=False
#     )
    
#     return HuggingFacePipeline(pipeline=pipe)

# llm = load_llm()

from langchain_groq import ChatGroq

def load_llm():
    return ChatGroq(
        model="llama-3.1-8b-instant",
        temperature=0,
        max_tokens=150
    )

llm = load_llm()


from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from langchain_core.documents import Document

from youtube_transcript_api import (
    NoTranscriptFound,
    TranscriptsDisabled,
    VideoUnavailable
)

def normalize_transcript(transcript):
    texts = []
    for chunk in transcript:
        if hasattr(chunk, "text"):
            texts.append(chunk.text)
        else:
            texts.append(chunk["text"])
    return " ".join(texts)


def ensure_iterable_transcript(transcript):
    if isinstance(transcript, list):
        return transcript
    
    if hasattr(transcript, "fetch"):
        return transcript.fetch()
    
    try:
        return list(transcript)
    except TypeError:
        raise ValueError("Unsupported transcript format")


def normalize_chunk(chunk):
    if isinstance(chunk, dict):
        return {
            "text": chunk.get("text", ""),
            "start": int(chunk.get("start", 0))
        }
    
    if hasattr(chunk, "text") and hasattr(chunk, "start"):
        return {
            "text": chunk.text,
            "start": int(chunk.start)
        }
    
    raise ValueError("Unknown transcript chunk format")


def load_youtube_docs(video_id: str):
    try:
        ytt = YouTubeTranscriptApi()
        
        try:
            transcript = ytt.fetch(video_id, languages=["en"])
        except NoTranscriptFound:
            transcript = None
        
        if transcript is None:
            transcript_list = ytt.list(video_id)
            
            for t in transcript_list:
                if t.language_code.startswith("en") and not t.is_generated:
                    transcript = t.fetch()
                    break
            
            if transcript is None:
                for t in transcript_list:
                    if t.language_code.startswith("en"):
                        transcript = t.fetch()
                        break
            
            if transcript is None:
                transcript = transcript_list[0].fetch()
    
    except (NoTranscriptFound, TranscriptsDisabled, VideoUnavailable, Exception):
        raise ValueError(
            "This video does not provide usable transcripts. "
            "Try another video or one with captions enabled."
        )
    
    docs = []
    transcript = ensure_iterable_transcript(transcript)
    
    for raw_chunk in transcript:
        chunk = normalize_chunk(raw_chunk)
        docs.append(
            Document(
                page_content=chunk["text"],
                metadata={"start": chunk["start"]}
            )
        )
    
    return docs


from langchain_text_splitters import RecursiveCharacterTextSplitter

def split_documents(docs):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100
    )
    
    chunks = []
    for doc in docs:
        split = splitter.split_text(doc.page_content)
        for text in split:
            chunks.append(
                Document(
                    page_content=text,
                    metadata={"start": doc.metadata["start"]}
                )
            )
    
    return chunks


from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS

def build_vectorstore(docs):
    embeddings = HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )
    return FAISS.from_documents(docs, embeddings)

from langchain_core.runnables import (
    RunnableParallel,
    RunnablePassthrough,
    RunnableLambda
)
from langchain_core.prompts import PromptTemplate
from langchain_core.output_parsers import StrOutputParser

def build_rag_chain(llm, retriever):
    def format_docs(docs):
        formatted = []
        for doc in docs:
            ts = doc.metadata.get("start", 0)
            minutes = ts // 60
            seconds = ts % 60
            timestamp = f"{minutes:02d}:{seconds:02d}"
            formatted.append(
                f"[{timestamp}] {doc.page_content}"
            )
        return "\n\n".join(formatted)
    
    parallel_chain = RunnableParallel({
        "context": retriever | RunnableLambda(format_docs),
        "question": RunnablePassthrough()
    })
    
    # IMPROVED PROMPT with stricter instructions
    prompt = PromptTemplate.from_template("""You are a helpful video transcript assistant.

CRITICAL RULES:
1. Answer ONLY using information from the Context below
2. If the Context does not contain the answer, you MUST respond with exactly: "I don't know"
3. Do NOT make up information
4. Do NOT use knowledge outside the Context
5. Keep answers concise (2-4 sentences maximum)

Context:
{context}

Question: {question}

Answer:""")
    
    parser = StrOutputParser()
    
    return parallel_chain | prompt | llm | parser

import re

def ask_youtube_video(video_id, question):
    print("ask_youtube_video started")
    
    print("building / loading vectorstore")
    db = get_or_create_vectorstore(
        video_id,
        docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
    )
    
    print("vectorstore ready, creating retriever")
    # Increase k for better coverage
    retriever = db.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 6}
    )
    
    print("retrieving relevant documents")
    docs = retriever.invoke(question)
    
    if not docs:
        return {
            "answer": "I don't know. The video does not contain this information.",
            "timestamp": None,
            "video_id": video_id
        }
    
    # Check relevance by looking at similarity scores
    # If all docs have very low similarity, the context is likely irrelevant
    
    print("building RAG chain")
    chain = build_rag_chain(llm, retriever)
    
    print("invoking chain")
    raw_answer = chain.invoke(question).strip()
    
    print(f"Raw answer: {raw_answer}")
    
    # Detect hallucination patterns
    if "I don't know" in raw_answer or "I do not know" in raw_answer:
        return {
            "answer": "I don't know. The video does not contain this information.",
            "timestamp": None,
            "video_id": video_id
        }
    
    # Get earliest timestamp from retrieved context
    ts = min(doc.metadata.get("start", 0) for doc in docs)
    mm, ss = divmod(ts, 60)
    timestamp_str = f"{mm:02d}:{ss:02d}"
    
    print("chain finished")
    
    return {
        "answer": raw_answer,
        "timestamp": ts,  # Return as integer (seconds)
        "timestamp_display": timestamp_str,
        "video_id": video_id
    }