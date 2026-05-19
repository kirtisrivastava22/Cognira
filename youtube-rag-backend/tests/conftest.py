import pytest
from app.rag import build_rag_chain, load_llm

@pytest.fixture
def rag_chain():
    llm = load_llm()
    
    class DummyRetriever:
        def invoke(self, query):
            return []
    
    return build_rag_chain(llm, DummyRetriever())