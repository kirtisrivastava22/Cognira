import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
const API = "http://localhost:3000"; 

const SharedConversation = () => {
  const { id } = useParams();
  const [data, setData] = useState(null);
const [conversationId, setConversationId] = useState(null);
  useEffect(() => {
    fetch(`${API}/conversation/${id}`)
      .then(res => res.json())
      .then(setData);
  }, [id]);

  if (!data) return <p>Loading...</p>;

  return (
    
    <div>
      <h2>Shared Conversation</h2>
      {data.messages.map((m, i) => (
        <div key={i} className="answer-box">
          <div>Q: {m.question}</div>
          <div>A: {m.answer}</div>
        </div>
      ))}
    </div>
  );
};

export default SharedConversation;