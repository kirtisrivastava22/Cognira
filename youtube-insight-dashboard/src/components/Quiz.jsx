import React, { useState } from 'react';
import './Quiz.css';

const Quiz = ({ videoId }) => {
  const [quiz, setQuiz] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generateQuiz = async () => {
    setLoading(true);
    setError('');
    setShowResults(false);

    try {
      const response = await fetch(`http://127.0.0.1:8000/quiz/${videoId}?num_questions=5`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setQuiz(data.questions);
      setUserAnswers(new Array(data.questions.length).fill(null));
    } catch (err) {
      console.error('Error generating quiz:', err);
      setError('Failed to generate quiz. Make sure the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (questionIndex, optionIndex) => {
    const newAnswers = [...userAnswers];
    newAnswers[questionIndex] = optionIndex;
    setUserAnswers(newAnswers);
  };

  const submitQuiz = () => {
    setShowResults(true);
  };

  const resetQuiz = () => {
    setQuiz(null);
    setUserAnswers([]);
    setShowResults(false);
  };

  const calculateScore = () => {
    let correct = 0;
    quiz.forEach((q, idx) => {
      if (userAnswers[idx] === q.correct) {
        correct++;
      }
    });
    return correct;
  };

  if (loading) {
    return (
      <div className="quiz-loading">
        <span className="spinner"></span>
        <p>Generating quiz questions...</p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="quiz-start">
        <button className="btn-primary" onClick={generateQuiz}>
          Generate Quiz (5 Questions)
        </button>
        {error && (
          <div className="status-box error">
            ⚠️ <span>{error}</span>
          </div>
        )}
        <div className="quiz-info">
          <div className="info-icon">📝</div>
          <p>Test your understanding of the video content with an AI-generated quiz!</p>
        </div>
      </div>
    );
  }

  if (showResults) {
    const score = calculateScore();
    const percentage = Math.round((score / quiz.length) * 100);
    const passed = percentage >= 60;

    return (
      <div className="quiz-results">
        <div className={`score-card ${passed ? 'pass' : 'fail'}`}>
          <div className="score-icon">{passed ? '🎉' : '📚'}</div>
          <h3 className="score-title">
            {passed ? 'Great Job!' : 'Keep Learning!'}
          </h3>
          <div className="score-display">
            <span className="score-value">{score}/{quiz.length}</span>
            <span className="score-percentage">{percentage}%</span>
          </div>
        </div>

        <div className="quiz-review">
          {quiz.map((q, idx) => {
            const userAns = userAnswers[idx];
            const isCorrect = userAns === q.correct;

            return (
              <div key={idx} className={`review-card ${isCorrect ? 'correct' : 'wrong'}`}>
                <div className="review-header">
                  <span className="review-number">Question {idx + 1}</span>
                  <span className={`review-badge ${isCorrect ? 'correct' : 'wrong'}`}>
                    {isCorrect ? '✓ Correct' : '✗ Wrong'}
                  </span>
                </div>
                <div className="review-question">{q.question}</div>
                <div className="review-answers">
                  {!isCorrect && userAns !== null && (
                    <div className="your-answer wrong">
                      Your answer: {q.options[userAns]}
                    </div>
                  )}
                  <div className="correct-answer">
                    Correct answer: {q.options[q.correct]}
                  </div>
                </div>
                <div className="review-explanation">{q.explanation}</div>
              </div>
            );
          })}
        </div>

        <button className="btn-primary" onClick={resetQuiz}>
          Take Another Quiz
        </button>
      </div>
    );
  }

  return (
    <div className="quiz-questions">
      {quiz.map((q, qIdx) => (
        <div key={qIdx} className="quiz-card">
          <div className="quiz-question-header">
            <span className="question-number">Question {qIdx + 1}</span>
            <span className="question-progress">{qIdx + 1}/{quiz.length}</span>
          </div>
          <div className="quiz-question">{q.question}</div>
          <div className="quiz-options">
            {q.options.map((opt, optIdx) => (
              <label key={optIdx} className="quiz-option">
                <input
                  type="radio"
                  name={`q${qIdx}`}
                  checked={userAnswers[qIdx] === optIdx}
                  onChange={() => handleAnswerSelect(qIdx, optIdx)}
                />
                <span className="option-text">{opt}</span>
                <span className="option-radio"></span>
              </label>
            ))}
          </div>
        </div>
      ))}

      <button
        className="btn-primary submit-quiz-btn"
        onClick={submitQuiz}
        disabled={userAnswers.some((ans) => ans === null)}
      >
        Submit Quiz
      </button>
    </div>
  );
};

export default Quiz;
