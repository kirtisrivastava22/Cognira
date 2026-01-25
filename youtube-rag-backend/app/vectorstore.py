import os
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/all-MiniLM-L6-v2"
)

VECTORSTORE_CACHE = {}

def get_or_create_vectorstore(video_id, docs_builder=None):
    path = f"vectorstores/{video_id}"
    
    # 1. RAM cache
    if video_id in VECTORSTORE_CACHE:
        return VECTORSTORE_CACHE[video_id]
    
    # 2. Disk cache
    if os.path.exists(path):
        db = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)
        VECTORSTORE_CACHE[video_id] = db
        return db
    
    # 3. Build (requires docs_builder)
    if docs_builder is None:
        raise ValueError(f"No cached vectorstore found for {video_id} and no docs_builder provided")
    
    docs = docs_builder(video_id)
    db = FAISS.from_documents(docs, embeddings)
    os.makedirs("vectorstores", exist_ok=True)
    db.save_local(path)
    VECTORSTORE_CACHE[video_id] = db
    return db