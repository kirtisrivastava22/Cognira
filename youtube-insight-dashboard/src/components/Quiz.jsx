import React, { useState } from "react";

const Quiz = ({ videoData }) => {
  const videoId = videoData?.videoId || "";

  const [quiz, setQuiz] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [numQuestions, setNumQuestions] = useState(5);

  const generateQuiz = async () => {
    setLoading(true);
    setError("");
    setShowResults(false);

    try {
      const response = await fetch(
        `http://127.0.0.1:8000/quiz/${videoId}?num_questions=${numQuestions}`,
      );
      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setQuiz(data.questions);
      setUserAnswers(new Array(data.questions.length).fill(null));
    } catch (err) {
      console.error("Error generating quiz:", err);
      setError("Failed to generate quiz. Make sure the backend is running.");
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
      if (userAnswers[idx] === q.correct) correct++;
    });
    return correct;
  };

  if (loading) {
    return (
      <div className="glass-card pad-lg" style={{ textAlign: "center" }}>
        <p style={{ marginTop: 12 }}>Generating quiz questions...</p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="glass-card pad-lg">
        <div className="card-row" style={{ marginBottom: 16 }}>
          <div className="chip">Quiz</div>
          <div className="chip">AI-generated</div>
        </div>

        <div className="quiz-config" style={{ marginBottom: 16 }}>
          <label htmlFor="num-questions" className="section-title" style={{ display: "block" }}>
            Number of Questions
          </label>
          <select
            id="num-questions"
            className="input-field"
            value={numQuestions}
            onChange={(e) => setNumQuestions(parseInt(e.target.value, 10))}
            style={{ maxWidth: 220 }}
          >
            <option value={3}>3 Questions</option>
            <option value={5}>5 Questions</option>
            <option value={7}>7 Questions</option>
            <option value={10}>10 Questions</option>
          </select>
        </div>

        <button className="btn-primary" onClick={generateQuiz}>
          Generate Quiz
        </button>

        {error && (
          <div className="status-box error" style={{ marginTop: 14 }}>
            ⚠️ <span>{error}</span>
          </div>
        )}

        <div className="empty-card" style={{ marginTop: 16 }}>
          <div className="empty-icon">📝</div>
          <p>Test your understanding with an AI-generated quiz.</p>
        </div>
      </div>
    );
  }

  if (showResults) {
    const score = calculateScore();
    const percentage = Math.round((score / quiz.length) * 100);
    const passed = percentage >= 60;

    return (
      <div className="glass-card pad-lg">
        <div className={`quiz-results ${passed ? "pass" : "fail"}`}>
          <div className="score-card">
            <div className="score-icon">{passed ? "🎉" : "😶‍🌫️"}</div>
            <h3 className="score-title">{passed ? "Great Job!" : "Keep Learning!"}</h3>
            <div className="score-display">
              <span className="score-value">
                {score}/{quiz.length}
              </span>
              <br />
              <span className="score-percentage">{percentage}%</span>
            </div>
          </div>
        </div>

        <div className="quiz-review" style={{ marginTop: 18 }}>
          {quiz.map((q, idx) => {
            const userAns = userAnswers[idx];
            const isCorrect = userAns === q.correct;

            return (
              <div key={idx} className={`review-card ${isCorrect ? "correct" : "wrong"}`} style={{ padding: 16 }}>
                <div className="review-header" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span className="review-number">Question {idx + 1}</span>
                  <span className={`chip ${isCorrect ? "good" : "warn"}`}>
                    {isCorrect ? "✓ Correct" : "✗ Wrong"}
                  </span>
                </div>

                <div className="review-question" style={{ marginTop: 10 }}>
                  {q.question}
                </div>

                <div className="review-answers" style={{ marginTop: 10 }}>
                  {!isCorrect && userAns !== null && (
                    <div className="your-answer wrong">
                      Your answer: {q.options[userAns]}
                    </div>
                  )}
                  <div className="correct-answer">
                    Correct answer: {q.options[q.correct]}
                  </div>
                </div>

                <div className="review-explanation text-secondary" style={{ marginTop: 10 }}>
                  {q.explanation}
                </div>
              </div>
            );
          })}
        </div>

        <button className="btn-primary" onClick={resetQuiz} style={{ marginTop: 16 }}>
          Take Another Quiz
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card pad-lg">
      <div className="card-row" style={{ marginBottom: 16 }}>
        <div className="chip">Quiz</div>
        <div className="chip">Question set ready</div>
      </div>

      <div className="quiz-questions">
        {quiz.map((q, qIdx) => (
          <div key={qIdx} className="quiz-card" style={{ padding: 16 }}>
            <div className="card-row" style={{ justifyContent: "space-between" }}>
              <span className="chip">Question {qIdx + 1}</span>
              <span className="chip">
                {qIdx + 1}/{quiz.length}
              </span>
            </div>

            <div className="quiz-question" style={{ marginTop: 12 }}>
              {q.question}
            </div>

            <div className="quiz-options" style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {q.options.map((opt, optIdx) => (
                <label key={optIdx} className="quiz-option">
                  <input
                    type="radio"
                    name={`q${qIdx}`}
                    checked={userAnswers[qIdx] === optIdx}
                    onChange={() => handleAnswerSelect(qIdx, optIdx)}
                  />
                  <span className="option-text">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        className="btn-primary"
        onClick={submitQuiz}
        disabled={userAnswers.some((ans) => ans === null)}
        style={{ marginTop: 16 }}
      >
        Submit Quiz
      </button>
    </div>
  );
};

export default Quiz;