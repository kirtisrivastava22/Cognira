from langchain_groq import ChatGroq
from langchain_core.prompts import PromptTemplate
from app.rag import load_youtube_docs, get_or_create_vectorstore, split_documents
import json
import random

llm = ChatGroq(
    model="llama-3.3-70b-versatile",
    temperature=0.3,
    max_tokens=1500
)
BAD_KEYWORDS = [
    "host", "speaker", "playlist","channel", "subscribe","like", "comment",
    "welcome", "my name", "this channel", "introduced","i am from"
]

def is_valid_fact(fact: str) -> bool:
    lower = fact.lower()
    return not any(k in lower for k in BAD_KEYWORDS)

def extract_key_facts(video_id: str):
    """Extract key facts/statements from video"""
    docs = load_youtube_docs(video_id)
    
    if not docs:
        return []
    
    # Sample diverse sections
    samples = []
    step = max(1, len(docs) // 10)  # Get 10 samples across video
    
    for i in range(0, len(docs), step):
        if i + 5 < len(docs):
            chunk = " ".join([d.page_content for d in docs[i:i+5]])
            samples.append(chunk)
    
    # Extract facts from each sample
    facts = []
    
    for sample in samples[:5]:  # Process 5 samples
        prompt = PromptTemplate.from_template("""
You are extracting QUIZ FACTS from a technical video transcript.

Extract 2–3 FACTUAL CONCEPT STATEMENTS.

ONLY include:
• definitions
• system components
• technical concepts
• architecture
• processes
• comparisons
• numbers related to systems

DO NOT include:
• audience level
• video topic
• speaker info
• channel info
• greetings
• opinions

Good examples:
"Virtual machines run on a hypervisor that manages hardware resources."
"A load balancer distributes traffic across multiple server instances."
"Cloud computing provides on-demand computing resources via the internet."

Return ONLY JSON array.

["Fact 1", "Fact 2", "Fact 3"]

Segment:
{text}

JSON:
""")
        
        try:
            chain = prompt | llm
            result = chain.invoke({"text": sample[:800]})
            
            # Parse JSON from response
            json_match = result.content.strip()
            if json_match.startswith('['):
                facts.extend(json.loads(json_match))
        except Exception as e:
            print(f"[extract_key_facts] Error: {e}")
            continue
    
    return facts


def generate_question_from_fact(fact: str):
    """Generate a question from a factual statement"""
    prompt = PromptTemplate.from_template("""
Create a MULTIPLE CHOICE question that tests understanding of this concept.

Rules:
• Question must test the concept in the fact
• Do NOT ask about the video itself
• Do NOT ask about audience or speaker
• Focus on understanding the system or concept

Example:
Fact: "A load balancer distributes incoming traffic across multiple servers."

Good Question:
"What is the role of a load balancer in cloud systems?"

Bad Question:
"What is the topic of the video?"

Return ONLY JSON:

{{
  "question": "...",
  "options": ["correct", "wrong1", "wrong2", "wrong3"],
  "correct": 0,
  "explanation": "..."
}}

Fact:
{fact}

JSON:
""")
    
    try:
        chain = prompt | llm
        result = chain.invoke({"fact": fact})
        
        # Extract JSON
        json_str = result.content.strip()
        if '{' in json_str:
            json_str = json_str[json_str.find('{'):json_str.rfind('}')+1]
        
        question = json.loads(json_str)
        
        # Shuffle options
        correct_answer = question['options'][0]
        random.shuffle(question['options'])
        question['correct'] = question['options'].index(correct_answer)
        
        return question
    except Exception as e:
        print(f"[generate_question_from_fact] Error: {e}")
        return None


def generate_quiz(video_id: str, num_questions: int = 5):
    """Generate quiz using fact extraction approach"""
    print(f"[generate_quiz] Extracting facts for {video_id}")
    
    facts = extract_key_facts(video_id)
    facts = [f for f in facts if is_valid_fact(f)]

    
    if not facts:
        return {"error": "Could not extract facts from video"}
    
    print(f"[generate_quiz] Extracted {len(facts)} facts")
    
    # Generate questions from facts
    questions = []
    for fact in facts[:num_questions * 2]:  # Get extras in case some fail
        q = generate_question_from_fact(fact)
        if q:
            questions.append(q)
        
        if len(questions) >= num_questions:
            break
    
    if len(questions) < num_questions:
        return {"error": f"Only generated {len(questions)} questions"}
    
    return {
        "video_id": video_id,
        "questions": questions[:num_questions]
    }