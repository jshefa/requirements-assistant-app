import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { getConfidenceSurvey } from "../../api/studyMaterials";
import { getConfidenceAnswers, logStudyEvent, saveConfidenceAnswer } from "../../api/studyLogging";
import ConfidenceQuestion from "../../components/research/ConfidenceQuestion";
import EducationMatrix from "../../components/research/EducationMatrix";
import "./ConfidenceSurvey.css";

function questionsInSection(section) {
  if (section.type === "likert_groups") {
    return section.groups.flatMap((group) => group.questions.map((question) => ({ ...question, type: "likert" })));
  }
  return (section.questions ?? []).map((question) => ({
    ...question,
    type: question.type ?? (section.type === "likert" ? "likert" : undefined),
  }));
}

function isAnswered(value, type) {
  if (value == null || value === "") return false;
  if (type !== "education_matrix") return typeof value !== "string" || value.trim() !== "";
  if (typeof value !== "object") return false;
  return Object.values(value).some((row) =>
    row && typeof row === "object" && Object.values(row).some((field) => field != null && String(field).trim() !== ""),
  );
}

function numberValidationError(question, value) {
  if (!isAnswered(value, question.type)) return null;
  if (question.type !== "integer" && question.type !== "decimal") return null;

  const number = Number(value);
  const validFormat = question.type === "decimal"
    ? /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value))
    : /^\d+$/.test(String(value));
  if (!validFormat || !Number.isFinite(number) || number < 0 || number > 120 ||
      (question.type === "integer" && !Number.isInteger(number))) {
    return question.type === "decimal"
      ? "Enter a valid decimal"
      : "Enter a valid whole number between 0 and 120";
  }
  return null;
}

function normalizedAnswer(question, value) {
  if (!isAnswered(value, question.type)) return null;

  const validationError = numberValidationError(question, value);
  if (validationError) throw new Error(validationError);

  if (question.type === "integer" || question.type === "decimal") {
    return Number(value);
  }

  return value;
}

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" ? detail : error?.message || "Something went wrong.";
}

export default function ConfidenceSurvey({
  sessionId: providedSessionId,
  phase = "pre",
  onContinue,
}) {
  const { sessionId: routeSessionId } = useParams();
  const sessionId = providedSessionId ?? routeSessionId;

  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState("");
  const [confirmSkipped, setConfirmSkipped] = useState(false);

  const answersRef = useRef({});
  const savedRef = useRef({});
  const queueRef = useRef(Promise.resolve());
  const navigatingRef = useRef(false);
  const contentRef = useRef(null);
  const confirmationRef = useRef(null);

  const sections = survey?.[phase] ?? [];
  const questions = sections.flatMap(questionsInSection);
  const questionLookup = Object.fromEntries(questions.map((question) => [question.id, question]));
  const answeredCount = questions.filter((question) => isAnswered(answers[question.id], question.type)).length;
  const skippedCount = questions.length - answeredCount;
  const currentSection = sections[sectionIndex];
  const hasInvalidNumber = currentSection && questionsInSection(currentSection).some(
    (question) => numberValidationError(question, answers[question.id]) !== null,
  );

  useEffect(() => {
    if (!sessionId || !["pre", "post"].includes(phase)) {
      setError("Invalid confidence survey session or phase.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");
    setConfirmSkipped(false);
    queueRef.current = Promise.resolve();

    Promise.all([getConfidenceSurvey(), getConfidenceAnswers(sessionId)])
      .then(([definition, saved]) => {
        if (!active) return;
        if (!Array.isArray(definition?.[phase]) || !definition[phase].length) {
          throw new Error("The survey definition is missing its sections.");
        }

        const restored = Object.fromEntries(saved.map((row) => [row.question_id, row.answer]));
        answersRef.current = restored;
        savedRef.current = structuredClone(restored);
        setAnswers(restored);
        setSurvey(definition);
        setSectionIndex(0);
      })
      .catch((err) => {
        if (active) setError(`Could not load confidence survey: ${errorMessage(err)}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [sessionId, phase]);

  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [sectionIndex]);

  // Use a modal rather than placing the optional-question confirmation in the form.
  useEffect(() => {
    const dialog = confirmationRef.current;
    if (!dialog) return;
    if (confirmSkipped && !dialog.open) dialog.showModal();
    if (!confirmSkipped && dialog.open) dialog.close();
  }, [confirmSkipped]);

  function queueSave(questionId) {
    const question = questionLookup[questionId];
    if (!question) return Promise.resolve();

    let snapshot;
    try {
      snapshot = normalizedAnswer(question, answersRef.current[questionId]);
    } catch (err) {
      setError(err.message);
      return Promise.reject(err);
    }

    // An untouched optional question doesn't need a database row.
    if (snapshot === null && !Object.prototype.hasOwnProperty.call(savedRef.current, questionId)) {
      return Promise.resolve();
    }
    if (sameValue(savedRef.current[questionId], snapshot)) return Promise.resolve();

    setPendingSaves((count) => count + 1);
    const job = queueRef.current.catch(() => {}).then(async () => {
      if (sameValue(savedRef.current[questionId], snapshot)) return;
      await saveConfidenceAnswer(sessionId, questionId, snapshot);
      savedRef.current[questionId] = structuredClone(snapshot);
    });
    queueRef.current = job;
    job.then(
      () => setPendingSaves((count) => count - 1),
      (err) => {
        setPendingSaves((count) => count - 1);
        setError(`Could not save your answer: ${errorMessage(err)}. Please try again.`);
      },
    );
    return job;
  }

  function updateAnswer(questionId, value, saveImmediately = false) {
    const updated = { ...answersRef.current, [questionId]: value };
    answersRef.current = updated;
    setAnswers(updated);
    setError("");
    setConfirmSkipped(false);
    if (saveImmediately) queueSave(questionId).catch(() => {});
  }

  async function flushAnswers() {
    // Include text inputs still focused when a participant navigates away.
    for (const questionId of Object.keys(answersRef.current)) {
      if (questionLookup[questionId]) queueSave(questionId).catch(() => {});
    }
    await queueRef.current.catch(() => {});

    for (const question of questions) {
      const questionId = question.id;
      if (!Object.prototype.hasOwnProperty.call(answersRef.current, questionId)) continue;

      let current;
      try {
        current = normalizedAnswer(question, answersRef.current[questionId]);
      } catch (err) {
        setError(err.message);
        return false;
      }
      if (current === null && !Object.prototype.hasOwnProperty.call(savedRef.current, questionId)) continue;
      if (!sameValue(savedRef.current[questionId], current)) {
        setError("Some answers could not be saved. Check your connection and try again.");
        return false;
      }
    }
    setError("");
    return true;
  }

  async function goToSection(direction) {
    if (navigatingRef.current || busy) return;
    navigatingRef.current = true;
    setBusy(true);
    try {
      if (!(await flushAnswers())) return;
      const fromSection = sections[sectionIndex];
      const toSection = sections[sectionIndex + direction];
      if (!fromSection || !toSection) return;

      setConfirmSkipped(false);
      // Log only successful section navigation; logging failures must not block the survey.
      logStudyEvent(sessionId, {
        event_type: direction > 0 ? "survey_section_next" : "survey_section_previous",
        event_data: { phase, from: fromSection.id, to: toSection.id },
      }).catch((err) => console.warn("Survey section navigation log failed:", err));
      setSectionIndex((index) => index + direction);
    } finally {
      navigatingRef.current = false;
      setBusy(false);
    }
  }

  async function finish(confirmedSkipped = false) {
    if (navigatingRef.current || busy) return;
    navigatingRef.current = true;
    setBusy(true);
    try {
      if (!(await flushAnswers())) return;
      if (skippedCount > 0 && !confirmedSkipped) {
        setConfirmSkipped(true);
        return;
      }
      if (!onContinue) throw new Error("Survey continuation handler was not provided.");
      await onContinue("manual");
    } catch (err) {
      setError(`Could not finish survey: ${errorMessage(err)}`);
    } finally {
      navigatingRef.current = false;
      setBusy(false);
    }
  }

  if (loading) return <div className="loading" role="status">Loading confidence survey...</div>;
  if (!survey || !currentSection) {
    return <div className="error-msg" role="alert">{error || "Confidence survey could not be loaded."}</div>;
  }

  return (
    <main className="confidence-survey">
      <header className="confidence-survey__header">
        <div className="confidence-survey__heading">
          <div>
            <p className="confidence-survey__eyebrow">Requirements evaluation</p>
            <h1>Confidence survey</h1>
            <p className="confidence-survey__subtitle">{phase === "pre" ? "Before the study" : "After the study"}</p>
          </div>
          <div className="confidence-survey__progress-summary">
            <strong>Section {sectionIndex + 1} of {sections.length}</strong>
            <span>{answeredCount} of {questions.length} answered</span>
          </div>
        </div>
        <div
          className="confidence-survey__progress-track"
          role="progressbar"
          aria-label="Survey section progress"
          aria-valuemin={0}
          aria-valuemax={sections.length}
          aria-valuenow={sectionIndex + 1}
        >
          <div style={{ width: `${((sectionIndex + 1) / sections.length) * 100}%` }} />
        </div>
      </header>

      <div ref={contentRef} className="confidence-survey__content">
        <section aria-labelledby="confidence-section-title" className="confidence-survey__section">
          <h2 id="confidence-section-title">{currentSection.title}</h2>
          {currentSection.instructions && <p className="confidence-survey__section-info">{currentSection.instructions}</p>}

          {currentSection.type === "likert_groups" ? (
            currentSection.groups.map((group) => (
              <div className="confidence-survey__group" key={group.title}>
                <h3>{group.title}</h3>
                {group.questions.map((question) => (
                  <ConfidenceQuestion
                    key={question.id}
                    question={question}
                    type="likert"
                    scaleInstructions={currentSection.scale_instructions}
                    value={answers[question.id]}
                    onChange={(value, immediate) => updateAnswer(question.id, value, immediate)}
                    onBlur={() => queueSave(question.id).catch(() => {})}
                    disabled={busy}
                  />
                ))}
              </div>
            ))
          ) : (
            currentSection.questions.map((question) => (
              question.type === "education_matrix" ? (
                <EducationMatrix
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  onChange={(value, immediate) => updateAnswer(question.id, value, immediate)}
                  onBlur={() => queueSave(question.id).catch(() => {})}
                  disabled={busy}
                />
              ) : (
                <ConfidenceQuestion
                  key={question.id}
                  question={question}
                  type={question.type ?? currentSection.type}
                  scaleInstructions={currentSection.scale_instructions}
                  value={answers[question.id]}
                  validationError={numberValidationError(question, answers[question.id])}
                  onChange={(value, immediate) => updateAnswer(question.id, value, immediate)}
                  onBlur={() => queueSave(question.id).catch(() => {})}
                  disabled={busy}
                />
              )
            ))
          )}
        </section>
      </div>

      <footer className="confidence-survey__footer">
        <div className="confidence-survey__feedback" aria-live="polite">
          {error && !hasInvalidNumber && <p className="error-msg" role="alert">{error}</p>}
          {hasInvalidNumber && (
            <p className="confidence-survey__validation-notice" role="alert">
              Please correct the highlighted answer before continuing.
            </p>
          )}
          {!hasInvalidNumber && (
            <span>
              {pendingSaves > 0 ? "Saving responses..." : error ? "Please retry the save" : "Responses saved automatically. Questions may be skipped."}
            </span>
          )}
        </div>
        <div className="confidence-survey__navigation">
          <button
            type="button"
            className="confidence-survey__back"
            onClick={() => goToSection(-1)}
            disabled={busy || sectionIndex === 0}
          >
            Previous
          </button>
          {sectionIndex < sections.length - 1 ? (
            <button type="button" className="btn-primary" disabled={busy || hasInvalidNumber} onClick={() => goToSection(1)}>
              Next section
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={busy || hasInvalidNumber} onClick={() => finish()}>
              {busy ? "Finishing..." : "Finish survey"}
            </button>
          )}
        </div>
      </footer>

      <dialog
        ref={confirmationRef}
        className="confidence-survey__confirmation"
        aria-labelledby="confidence-confirm-title"
        aria-describedby="confidence-confirm-description"
        onClose={() => setConfirmSkipped(false)}
      >
        <h3 id="confidence-confirm-title">Finish with unanswered questions?</h3>
        <p id="confidence-confirm-description">
          You have {skippedCount} unanswered {skippedCount === 1 ? "question" : "questions"}.
          Skipping questions is allowed. You can go back to review your answers or finish now.
        </p>
        <div className="confidence-survey__confirmation-actions">
          <button type="button" className="confidence-survey__back" onClick={() => setConfirmSkipped(false)} disabled={busy}>
            Review answers
          </button>
          <button type="button" className="btn-primary" onClick={() => { setConfirmSkipped(false); finish(true); }} disabled={busy}>
            Finish anyway
          </button>
        </div>
      </dialog>
    </main>
  );
}
