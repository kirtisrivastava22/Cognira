import React, { useState, useRef, useEffect } from 'react';
import './AskQuestion.css';

const AskQuestion = ({ videoId }) => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const answerRef = useRef(null);

  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight;
    }
  }, [answer]);

  const handleAsk = async () => {
    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    setAnswer('');
    setError('');
    setIsLoading(true);
    setStatus('Analyzing transcript...');

    try {
      const response = await fetch('http://127.0.0.1:8000/ask_stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: videoId, question }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      setStatus('Generating answer...');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullAnswer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const event of events) {
          if (!event.startsWith('data: ')) continue;

          const payload = JSON.parse(event.slice(6));

          switch (payload.type) {
            case 'status':
              setStatus(payload.value);
              break;

            case 'token': {
              const text = payload.value;
              fullAnswer += text;
              
              // Process timestamps in the text - make them clickable
              const formatted = text.replace(/\[(\d{2}):(\d{2})\]/g, (match, mm, ss) => {
                const seconds = parseInt(mm) * 60 + parseInt(ss);
                return `<span class="inline-ts" data-time="${seconds}">${match}</span>`;
              });
              setAnswer((prev) => prev + formatted);
              break;
            }

            case 'end':
              // Final pass: ensure ALL timestamps are wrapped (fallback)
              setAnswer((prev) => {
                return prev.replace(/\[(\d{2}):(\d{2})\]/g, (match, mm, ss) => {
                  const seconds = parseInt(mm) * 60 + parseInt(ss);
                  return `<span class="inline-ts" data-time="${seconds}">${match}</span>`;
                });
              });
              
              setStatus('');
              setIsLoading(false);
              break;

            default:
              break;
          }
        }
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to connect to backend. Make sure the server is running on http://127.0.0.1:8000');
      setIsLoading(false);
      setStatus('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const handleTimestampClick = (seconds) => {
    // Open YouTube video at specific timestamp
    window.open(`https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`, '_blank');
  };

  const handleExportPDF = async () => {
    try {
      setStatus('Generating PDF...');
      const response = await fetch(`http://127.0.0.1:8000/export/pdf?video_id=${videoId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to export PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${videoId}_notes.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
      setStatus('');
    } catch (err) {
      console.error('Export error:', err);
      setError('Failed to export PDF');
    }
  };

  return (
    <div className="ask-question">
      <div className="input-group">
        <label htmlFor="question-input">Your Question</label>
        <textarea
          id="question-input"
          className="textarea"
          rows="3"
          placeholder="What is this video about?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={isLoading}
        />
      </div>

      <button className="btn-primary" onClick={handleAsk} disabled={isLoading}>
        {isLoading ? (
          <>
            <span className="spinner"></span>
            Analyzing...
          </>
        ) : (
          'Ask Question'
        )}
      </button>

      {status && (
        <div className="status-box loading">
          <span className="spinner"></span>
          <span>{status}</span>
        </div>
      )}

      {error && (
        <div className="status-box error">
          ⚠️ <span>{error}</span>
        </div>
      )}

      {answer && (
        <div className="answer-box">
          <div className="answer-header">Answer</div>
          <div
            className="answer-content"
            ref={answerRef}
            dangerouslySetInnerHTML={{ __html: answer }}
            onClick={(e) => {
              if (e.target.classList.contains('inline-ts')) {
                const seconds = parseInt(e.target.dataset.time);
                handleTimestampClick(seconds);
              }
            }}
          />
        </div>
      )}

      <button className="btn-primary export-btn" onClick={handleExportPDF}>
        📄 Export Notes as PDF
      </button>
    </div>
  );
};

export default AskQuestion;