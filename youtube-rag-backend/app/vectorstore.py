import os
from langchain_community.vectorstores import FAISS
from langchain_huggingface import HuggingFaceEmbeddings

embeddings = HuggingFaceEmbeddings(
    model_name="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
)

VECTORSTORE_CACHE = {}

def get_or_create_vectorstore(media_id, docs_builder=None):
    print(f"[get_or_create_vectorstore] video_id={media_id}")
    path = f"vectorstores/{media_id}"
    
    # 1. RAM cache
    cached = VECTORSTORE_CACHE.get(media_id)
    if cached is not None:
        return cached
    
    # 2. Disk cache
    if os.path.exists(path):
        db = FAISS.load_local(path, embeddings, allow_dangerous_deserialization=True)
        VECTORSTORE_CACHE[media_id] = db
        return db
    
    # 3. Build (requires docs_builder)
    if docs_builder is None:
        raise ValueError(f"No cached vectorstore found for {media_id} and no docs_builder provided")
    
    docs = docs_builder(media_id)
    
    if not docs:
        # No transcript available → return None
        return None
    
    db = FAISS.from_documents(docs, embeddings)
    os.makedirs("vectorstores", exist_ok=True)
    db.save_local(path)
    VECTORSTORE_CACHE[media_id] = db
    return db