import React, { useState } from "react";

const API = process.env.REACT_APP_API_URL || "/api";

const DIFFICULTY_GUIDANCE = {
  easy:   "Use straightforward language. The correct answer should be obvious to someone who watched the content.",
  medium: "Require understanding, not just recall. Distractors should be plausible but clearly wrong on reflection.",
  hard:   "Require deep understanding. All distractors should be plausible; the correct answer requires careful reasoning.",
};

const BAD_KEYWORDS = ["host", "speaker", "playlist", "channel", "subscribe", "like", "comment",
  "welcome", "my name", "this channel", "today we", "in this video", "don't forget", "hit the bell"];

function isValidFact(fact) {
  const lower = fact.toLowerCase();
  return fact.trim().length > 20 && !BAD_KEYWORDS.some(k => lower.includes(k));
}

// ── Sample docs into windows ──────────────────────────────────────────────
function sampleWindows(docs, numWindows = 6) {
  if (!docs.length) return [];
  const sorted = [...docs].sort((a, b) => (a.metadata?.start || 0) - (b.metadata?.start || 0));
  const step = Math.max(1, Math.floor(sorted.length / numWindows));
  const windows = [];
  for (let i = 0; i < sorted.length; i += step) {
    const chunk = sorted.slice(i, i + 6);
    const text  = chunk.map(d => d.page_content).join(" ");
    const start = chunk[0].metadata?.start || 0;
    const mm    = String(Math.floor(start / 60)).padStart(2, "0");
    const ss    = String(start % 60).padStart(2, "0");
    windows.push({ text: text.slice(0, 900), timestamp: `${mm}:${ss}` });
    if (windows.length >= numWindows) break;
  }
  return windows;
}

// ── Extract facts from windows ────────────────────────────────────────────
async function extractFacts(windows, groqKey) {
  const facts = [];
  for (const w of windows) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          temperature: 0,
          max_tokens: 300,
          messages: [{
            role: "user",
            content: `Extract 2-3 factual concept statements from this transcript. Include only definitions, system components, technical processes, specific metrics. Exclude speaker info, greetings, channel mentions.

Respond with ONLY a JSON array: ["Fact 1", "Fact 2"]

Transcript:
${w.text}

JSON:`
          }],
        }),
      });
      if (!res.ok) continue;
      const data    = await res.json();
      const content = data.choices?.[0]?.message?.content || "[]";
      const clean   = content.replace(/```(?:json)?/g, "").trim();
      const start   = clean.indexOf("[");
      const end     = clean.lastIndexOf("]");
      if (start === -1) continue;
      const parsed = JSON.parse(clean.slice(start, end + 1));
      for (const f of parsed) {
        if (typeof f === "string" && isValidFact(f)) {
          facts.push({ fact: f, timestamp: w.timestamp });
        }
      }
    } catch {}
  }
  return facts;
}

// ── Generate one MCQ from a fact ──────────────────────────────────────────
async function generateQuestion(fact, timestamp, difficulty, groqKey) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      temperature: 0.3,
      max_tokens: 400,
      messages: [{
        role: "user",
        content: `Create a multiple-choice question testing this concept.

Difficulty: ${difficulty}
Guidance: ${DIFFICULTY_GUIDANCE[difficulty]}

Rules:
- 4 options total; exactly one correct
- Distractors plausible but wrong
- Return ONLY this JSON, no markdown:
{"question":"...","options":["correct answer","distractor1","distractor2","distractor3"],"explanation":"..."}

Fact: ${fact}

JSON:`
      }],
    }),
  });

  if (!res.ok) return null;
  const data    = await res.json();
  const content = data.choices?.[0]?.message?.content || "";
  const clean   = content.replace(/```(?:json)?/g, "").trim();
  const start   = clean.indexOf("{");
  const end     = clean.lastIndexOf("}");
  if (start === -1) return null;

  const parsed      = JSON.parse(clean.slice(start, end + 1));
  const correctText = parsed.options[0];
  const options     = [...parsed.options].sort(() => Math.random() - 0.5);

  return {
    question:    parsed.question,
    options,
    correct:     options.indexOf(correctText),
    explanation: parsed.explanation || "",
    difficulty,
    timestamp,
    source_fact: fact,
  };
}

// ── Full quiz generation pipeline ─────────────────────────────────────────
async function generateQuizInBrowser(docs, numQuestions, difficulty, groqKey) {
  const windows     = sampleWindows(docs, Math.min(8, numQuestions * 2));
  const facts       = await extractFacts(windows, groqKey);
  if (!facts.length) throw new Error("Could not extract facts from the transcript.");

  const questions = [];
  for (const fo of facts.slice(0, numQuestions * 2)) {
    const q = await generateQuestion(fo.fact, fo.timestamp, difficulty, groqKey);
    if (q) questions.push(q);
    if (questions.length >= numQuestions) break;
  }

  if (!questions.length) throw new Error("Question generation failed.");
  return questions.slice(0, numQuestions);
}

// ── Component ─────────────────────────────────────────────────────────────
export default function Quiz({ videoData, groqKey, onNeedKey }) {
  const videoId = videoData?.videoId || "";

  const [quiz,         setQuiz]         = useState(null);
  const [userAnswers,  setUserAnswers]  = useState([]);
  const [showResults,  setShowResults]  = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [loadingStep,  setLoadingStep]  = useState("");
  const [error,        setError]        = useState("");
  const [numQuestions, setNumQuestions] = useState(5);
  const [difficulty,   setDifficulty]   = useState("medium");

  const generate = async () => {
    const key = groqKey || localStorage.getItem("groq_api_key") || "";
    if (!key) { onNeedKey?.(); setError("Add your Groq API key to generate a quiz."); return; }

    setLoading(true); setError(""); setShowResults(false);
    try {
      // Step 1: Get docs from backend
      setLoadingStep("Loading transcript…");
      const res = await fetch(`${API}/retrieve`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ video_id: videoId, question: "key concepts facts definitions", k: 40 }),
      });
      if (!res.ok) throw new Error("Could not load transcript from server.");
      const { docs } = await res.json();
      if (!docs?.length) throw new Error("No transcript content available.");

      // Step 2: Generate quiz in browser
      setLoadingStep("Extracting facts…");
      const questions = await generateQuizInBrowser(docs, numQuestions, difficulty, key);

      setQuiz(questions);
      setUserAnswers(new Array(questions.length).fill(null));
    } catch (e) {
      if (e.message?.includes("401")) setError("Invalid Groq API key. Check your key in Settings.");
      else if (e.message?.includes("429")) setError("Groq rate limit reached. Wait a moment.");
      else setError(e.message || "Failed to generate quiz.");
    } finally {
      setLoading(false);
      setLoadingStep("");
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

  // ── Config screen ────────────────────────────────────────────────────────
  if (!quiz) {
    return (
      <div>
        <div className="heading" style={{ fontSize: 15, marginBottom: 4 }}>AI Quiz</div>
        <div className="caption mb-24">Questions generated in your browser · no server LLM needed</div>

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
            <span className="body">{loadingStep || "Generating questions…"}</span>
            <span className="caption">This takes 20–40 seconds for quality results</span>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={generate}>Generate quiz</button>
        )}

        {error && <div className="status-box status-error mt-16">⚠ {error}</div>}
      </div>
    );
  }

  // ── Results screen ───────────────────────────────────────────────────────
  if (showResults) {
    return (
      <div>
        <div className={`score-ring ${pass ? "pass" : "fail"}`}>{pct}%</div>
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
                <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 4 }}>Your answer: {q.options[userAnswers[qi]]}</div>
              )}
              <div style={{ fontSize: 13, color: "var(--green)", marginBottom: 8 }}>Correct: {q.options[q.correct]}</div>
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

  // ── Quiz screen ──────────────────────────────────────────────────────────
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
            <span className="tag tag-default" style={{ fontFamily: "DM Mono, monospace" }}>{qi + 1}/{quiz.length}</span>
            {q.timestamp && (
              <span className="tag tag-accent" style={{ fontFamily: "DM Mono, monospace", fontSize: 11 }}>{q.timestamp}</span>
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
                  background:  userAnswers[qi] === oi ? "var(--accent)" : "transparent",
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

      <button className="btn btn-primary" onClick={submit} disabled={!allAnswered}>
        {allAnswered ? "Submit quiz" : `${quiz.length - userAnswers.filter(a => a !== null).length} remaining`}
      </button>
    </div>
  );
}