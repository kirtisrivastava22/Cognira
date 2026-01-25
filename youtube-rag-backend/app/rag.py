import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    pipeline,
    BitsAndBytesConfig
)
# from langchain_community.llms import HuggingFacePipeline
from langchain_huggingface import HuggingFacePipeline
from app.vectorstore import get_or_create_vectorstore
def load_llm():
    MODEL_ID = "Qwen/Qwen2.5-3B-Instruct"


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
        max_new_tokens=256,
        temperature=0.2
    )

    return HuggingFacePipeline(pipeline=pipe)

llm = load_llm()

from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled
from langchain_core.documents import Document

def load_youtube_docs(video_id: str):
    try:
        ytt_api = YouTubeTranscriptApi()
        transcript = ytt_api.fetch(video_id, languages=["en"])

        text = " ".join(chunk.text for chunk in transcript)
        return [Document(page_content=text)]

    except TranscriptsDisabled:
        raise ValueError("Transcripts are disabled for this video.")

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
    db = get_or_create_vectorstore(
        video_id, 
        docs_builder=lambda vid: split_documents(load_youtube_docs(vid))
    )
    retriever = db.as_retriever(search_kwargs={"k": 4})
    chain = build_rag_chain(llm, retriever)
    return chain.invoke(question)

