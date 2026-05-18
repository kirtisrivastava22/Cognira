import React, { useState } from "react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

export default function Quiz({ videoData }) {
  const videoId = videoData?.videoId || "";

  const [quiz,          setQuiz]          = useState(null);
  const [userAnswers,   setUserAnswers]   = useState([]);
  const [showResults,   setShowResults]   = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState("");
  const [numQuestions,  setNumQuestions]  = useState(5);
  const [difficulty,    setDifficulty]    = useState("medium");

  const generate = async () => {
    setLoading(true); setError(""); setShowResults(false);
    try {
      const res  = await fetch(`${API}/quiz/${videoId}?num_questions=${numQuestions}&difficulty=${difficulty}`);
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      if (!data.questions?.length) { setError("No questions generated."); return; }
      setQuiz(data.questions);
      setUserAnswers(new Array(data.questions.length).fill(null));
    } catch {
      setError("Failed to generate quiz. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const select = (qi, oi) => {
    if (showResults) return;
    const next = [...userAnswers];
    next[qi] = oi;
    setUserAnswers(next);
  };

  const submit = () => setShowResults(true);
  const reset  = () => { setQuiz(null); setUserAnswers([]); setShowResults(false); setError(""); };

  const score = quiz ? quiz.filter((q, i) => userAnswers[i] === q.correct).length : 0;
  const pct   = quiz ? Math.round((score / quiz.length) * 100) : 0;
  const pass  = pct >= 60;

  /* Config screen */
  if (!quiz) {
    return (
      <div>
        <div className="heading" style={{ fontSize: 15, marginBottom: 4 }}>AI Quiz</div>
        <div className="caption mb-24">Questions generated directly from the content</div>

        <div className="flex gap-16 mb-20" style={{ flexWrap: "wrap" }}>
          <div className="field-group" style={{ minWidth: 140 }}>
            <label>Questions</label>
            <select value={numQuestions} onChange={e => setNumQuestions(+e.target.value)}>
              <option value={3}>3</option>
              <option value={5}>5</option>
              <option value={7}>7</option>
              <option value={10}>10</option>
            </select>
          </div>
          <div className="field-group" style={{ minWidth: 140 }}>
            <label>Difficulty</label>
            <select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">
            <span className="spinner" style={{ width: 20, height: 20 }} />
            <span className="body">Extracting facts and building questions…</span>
            <span className="caption">This takes 20–40 seconds for quality results</span>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={generate}>Generate quiz</button>
        )}

        {error && <div className="status-box status-error mt-16">⚠ {error}</div>}
      </div>
    );
  }

  /* Results screen */
  if (showResults) {
    return (
      <div>
        <div className={`score-ring ${pass ? "pass" : "fail"}`}>
          {pct}%
        </div>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div className="heading">{pass ? "Well done!" : "Keep studying"}</div>
          <div className="caption mt-4">{score} of {quiz.length} correct</div>
        </div>

        <div className="divider" />

        {quiz.map((q, qi) => {
          const correct = userAnswers[qi] === q.correct;
          return (
            <div key={qi} style={{ marginBottom: 18, padding: "16px 18px", borderRadius: "var(--radius-lg)", border: `1px solid ${correct ? "rgba(74,222,128,0.25)" : "rgba(248,113,113,0.25)"}`, background: correct ? "var(--green-dim)" : "var(--red-dim)" }}>
              <div className="flex items-center justify-between mb-8">
                <span className="caption">Question {qi + 1}</span>
                <span className={`tag ${correct ? "tag-green" : "tag-red"}`}>{correct ? "✓ Correct" : "✗ Wrong"}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 10 }}>{q.question}</div>
              {!correct && userAnswers[qi] !== null && (
                <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 4 }}>
                  Your answer: {q.options[userAnswers[qi]]}
                </div>
              )}
              <div style={{ fontSize: 13, color: "var(--green)", marginBottom: 8 }}>
                Correct: {q.options[q.correct]}
              </div>
              {q.explanation && (
                <div className="caption" style={{ lineHeight: 1.6, color: "var(--text-secondary)" }}>{q.explanation}</div>
              )}
            </div>
          );
        })}

        <button className="btn btn-primary mt-16" onClick={reset}>Try again</button>
      </div>
    );
  }

  /* Quiz screen */
  const allAnswered = userAnswers.every(a => a !== null);

  return (
    <div>
      <div className="flex items-center justify-between mb-20">
        <div>
          <div className="heading" style={{ fontSize: 15 }}>Quiz · {difficulty}</div>
          <div className="caption mt-4">{quiz.length} questions</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={reset}>← New quiz</button>
      </div>

      {quiz.map((q, qi) => (
        <div key={qi} style={{ marginBottom: 20 }}>
          <div className="flex items-center gap-8 mb-10">
            <span className="tag tag-default" style={{ fontFamily: "DM Mono, monospace" }}>
              {qi + 1}/{quiz.length}
            </span>
            {q.timestamp && (
              <span className="tag tag-accent" style={{ fontFamily: "DM Mono, monospace", fontSize: 11 }}>
                {q.timestamp}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", marginBottom: 12, lineHeight: 1.6 }}>
            {q.question}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {q.options.map((opt, oi) => (
              <label key={oi} className={`quiz-option${userAnswers[qi] === oi ? " selected" : ""}`}
                onClick={() => select(qi, oi)} style={{ cursor: "pointer" }}>
                <span style={{
                  width: 20, height: 20, border: "2px solid",
                  borderColor: userAnswers[qi] === oi ? "var(--accent)" : "var(--border-strong)",
                  background: userAnswers[qi] === oi ? "var(--accent)" : "transparent",
                  flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s",
                }}>
                  {userAnswers[qi] === oi && <span style={{ width: 8, height: 8, background: "var(--text-inverse)", borderRadius: "50%" }} />}
                </span>
                <span style={{ flex: 1, fontSize: 13.5 }}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      ))}

      <button
        className="btn btn-primary"
        onClick={submit}
        disabled={!allAnswered}
      >
        {allAnswered ? "Submit quiz" : `${quiz.length - userAnswers.filter(a => a !== null).length} remaining`}
      </button>
    </div>
  );
}