import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    pipeline,
    BitsAndBytesConfig
)

from langchain_huggingface import HuggingFacePipeline
from app.vectorstore import get_or_create_vectorstore
def load_llm():
    # MODEL_ID = "Qwen/Qwen2.5-3B-Instruct"
    # MODEL_ID = "Qwen/Qwen2.5-1.5B-Instruct"
    MODEL_ID = "Qwen/Qwen2.5-0.5B-Instruct"

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)

    quant_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4"
    )

    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        device_map="auto",
        quantization_config=quant_config,
        dtype=torch.float16
    )

    pipe = pipeline(
        "text-generation",
        model=model,
        tokenizer=tokenizer,
        max_new_tokens=180,
        temperature=0.1,
        do_sample=False
    )

    return HuggingFacePipeline(pipeline=pipe)

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


def load_youtube_docs(video_id: str):
    try:
        ytt = YouTubeTranscriptApi()
        transcript = ytt.fetch(video_id, languages=["en"])


    except (NoTranscriptFound, TranscriptsDisabled, VideoUnavailable):
        try:
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            for t in transcript_list:
                if t.language_code.startswith("en"):
                    transcript = t.fetch()
                    break
            else:
                raise ValueError("No transcript available for this video")
        except Exception:
            raise ValueError(
                "This video does not provide transcripts. "
                "Try another video or one with captions enabled."
            )

    text = normalize_transcript(transcript)
    return [Document(page_content=text)]


from langchain_text_splitters import RecursiveCharacterTextSplitter

def split_documents(docs):
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=800,
        chunk_overlap=100
    )
    return splitter.split_documents(docs)

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
        return "\n\n".join(doc.page_content for doc in docs)

    parallel_chain = RunnableParallel({
        "context": retriever | RunnableLambda(format_docs),
        "question": RunnablePassthrough()
    })

    prompt = PromptTemplate.from_template("""
You are a helpful assistant.
Rules:
- Use ONLY the provided context.
- Write only upto 10 sentences.
- Do NOT repeat ideas.
- Do NOT add introductions or conclusions.
- Stop immediately after the last sentence.
- If the answer is not in the context, say: I don't know.

Using ONLY the context below, answer the user's question.
If the answer is not contained in the context, say "I don't know".

Context:
{context}

Question:
{question}

Answer (concise and clear):
""")


    parser = StrOutputParser()

    return parallel_chain | prompt | llm | parser

def ask_youtube_video(video_id, question):
    print(" ask_youtube_video started")

    print(" building / loading vectorstore")
    db = get_or_create_vectorstore(
        video_id,
        docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
    )

    print(" vectorstore ready, creating retriever")
    retriever = db.as_retriever(search_kwargs={"k": 4})

    print(" building RAG chain")
    chain = build_rag_chain(llm, retriever)

    print(" invoking chain")
    result = chain.invoke(question)

    print(" chain finished")
    return result


