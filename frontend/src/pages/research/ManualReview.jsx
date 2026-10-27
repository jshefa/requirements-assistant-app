import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { getAnalysisSurvey, getStudyMaterials } from "../../api/studyMaterials";
import {
  getManualEvals,
  logStudyEvent,
  saveManualEval,
} from "../../api/studyLogging";
import CriterionOption from "../../components/CriterionOption";
import StudyReviewLayout from "../../components/research/StudyReviewLayout";
import "./ManualReview.css";

function normalizeRequirements(raw) {
  if (!Array.isArray(raw))
    throw new Error("Unexpected requirements format from the server.");

  return raw.map((item, index) => {
    const id =
      item && typeof item === "object"
        ? (item.id ?? item.req_id ?? item.requirement_id)
        : index + 1;
    const text =
      typeof item === "string"
        ? item
        : (item?.text ?? item?.requirement_text ?? item?.original_text ?? "");

    if (id == null || !String(text).trim()) {
      throw new Error(
        `Missing requirement ID or text at position ${index + 1}.`,
      );
    }
    return { id: String(id), text: String(text) };
  });
}

function sameAnswer(a, b) {
  return (
    Boolean(a?.selected) === Boolean(b?.selected) &&
    (a?.notes ?? "") === (b?.notes ?? "")
  );
}

// A1 needs no explanation, but every selected violation does.
function missingReasoning(answers, requirementId) {
  return Object.entries(answers[requirementId] ?? {})
    .filter(
      ([criterionId, answer]) =>
        criterionId !== "A1" && answer.selected && !(answer.notes ?? "").trim(),
    )
    .map(([criterionId]) => criterionId);
}

function hasCompleteResponse(answers, requirementId) {
  const hasSelection = Object.values(answers[requirementId] ?? {}).some(
    (answer) => answer.selected,
  );
  return hasSelection && missingReasoning(answers, requirementId).length === 0;
}

function errorMessage(error) {
  return (
    error?.response?.data?.detail || error?.message || "Something went wrong."
  );
}

export default function ManualReview({
  sessionId: providedSessionId,
  onContinue,
  autoAdvance = false,
  timer,
  onRequirementChange,
}) {
  const { sessionId: routeSessionId } = useParams();
  const sessionId = providedSessionId ?? routeSessionId;

  const [requirements, setRequirements] = useState([]);
  const [survey, setSurvey] = useState(null);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState("");

  // Keep the newest typed text available even when React hasn't rerendered yet.
  const answersRef = useRef({});
  // Last *confirmed* server state, so failed saves can be retried on navigation.
  const savedRef = useRef({});
  // Serialize writes to keep append-only answer history in the correct order.
  const saveQueueRef = useRef(Promise.resolve());
  const navigatingRef = useRef(false);
  const timeoutAttemptedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing study session ID.");
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError("");

    Promise.all([
      getStudyMaterials(),
      getAnalysisSurvey(),
      getManualEvals(sessionId),
    ])
      .then(([materials, surveyResponse, existing]) => {
        if (!active) return;

        const loadedRequirements = normalizeRequirements(
          materials.requirements,
        );
        const definition = surveyResponse.analysis_survey ?? surveyResponse;
        if (!definition?.choices || !Object.keys(definition.choices).length) {
          throw new Error("The analysis survey has no criterion choices.");
        }
        if (!loadedRequirements.length) {
          throw new Error("No requirements were returned for manual review.");
        }

        const restored = {};
        for (const row of existing) {
          restored[row.requirement_id] ??= {};
          restored[row.requirement_id][row.criterion_id] = {
            selected: row.selected,
            notes: row.notes ?? "",
          };
        }

        answersRef.current = restored;
        savedRef.current = structuredClone(restored);
        setAnswers(restored);
        setRequirements(loadedRequirements);
        setSurvey(definition);

        // Resume at the first incomplete requirement after a refresh.
        const nextIncomplete = loadedRequirements.findIndex(
          (requirement) => !hasCompleteResponse(restored, requirement.id),
        );
        setIndex(
          nextIncomplete === -1
            ? loadedRequirements.length - 1
            : nextIncomplete,
        );
      })
      .catch((err) => {
        if (active) setError(errorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId]);

  function updateLocalAnswer(requirementId, criterionId, value) {
    const updated = {
      ...answersRef.current,
      [requirementId]: {
        ...(answersRef.current[requirementId] ?? {}),
        [criterionId]: value,
      },
    };
    answersRef.current = updated;
    setAnswers(updated);
  }

  function queueSave(requirementId, criterionId, answer) {
    const snapshot = { selected: answer.selected, notes: answer.notes ?? "" };
    setPendingSaves((count) => count + 1);

    const job = saveQueueRef.current
      .catch(() => {})
      .then(async () => {
        const lastSaved = savedRef.current[requirementId]?.[criterionId];
        if (sameAnswer(lastSaved, snapshot)) return;

        await saveManualEval(
          sessionId,
          requirementId,
          criterionId,
          snapshot.selected,
          snapshot.notes,
        );
        savedRef.current[requirementId] ??= {};
        savedRef.current[requirementId][criterionId] = snapshot;
      });

    saveQueueRef.current = job;
    job.then(
      () => setPendingSaves((count) => count - 1),
      (err) => {
        setPendingSaves((count) => count - 1);
        setError(
          `Could not save your answer: ${errorMessage(err)}. Try navigating again to retry.`,
        );
      },
    );
    return job;
  }

  function logEvent(event) {
    // Event logging should not stop participants from answering questions.
    logStudyEvent(sessionId, event).catch((err) => {
      console.warn("Study interaction log failed:", err);
    });
  }

  function changeSelection(requirementId, criterionId, checked) {
    const current = answersRef.current[requirementId] ?? {};
    const selected = Object.entries(current)
      .filter(([, answer]) => answer.selected)
      .map(([id]) => id);

    if (checked && criterionId === "A1" && selected.some((id) => id !== "A1")) {
      setConflict(
        "Deselect your selected violations before choosing A1. Nothing has been cleared.",
      );
      return;
    }
    if (checked && criterionId !== "A1" && selected.includes("A1")) {
      setConflict(
        "Deselect A1 before choosing a violation. Your existing work will be preserved.",
      );
      return;
    }

    setConflict("");
    setError("");
    const previous = current[criterionId];
    const next = { selected: checked, notes: previous?.notes ?? "" };
    updateLocalAnswer(requirementId, criterionId, next);
    // Checkboxes are saved immediately; reasoning is saved on blur/navigation.
    queueSave(requirementId, criterionId, next).catch(() => {});
  }

  function changeNotes(requirementId, criterionId, notes) {
    const current = answersRef.current[requirementId]?.[criterionId];
    if (!current) return;
    updateLocalAnswer(requirementId, criterionId, { ...current, notes });
  }

  function saveNotes(requirementId, criterionId) {
    const current = answersRef.current[requirementId]?.[criterionId];
    if (!current) return;
    queueSave(requirementId, criterionId, current).catch(() => {});
  }

  async function flushRequirement(requirementId) {
    // Enqueue any text that hasn't been saved yet, including after a failed write.
    for (const [criterionId, answer] of Object.entries(
      answersRef.current[requirementId] ?? {},
    )) {
      if (!sameAnswer(savedRef.current[requirementId]?.[criterionId], answer)) {
        queueSave(requirementId, criterionId, answer).catch(() => {});
      }
    }

    await saveQueueRef.current.catch(() => {});
    const unsaved = Object.entries(
      answersRef.current[requirementId] ?? {},
    ).some(
      ([criterionId, answer]) =>
        !sameAnswer(savedRef.current[requirementId]?.[criterionId], answer),
    );
    if (unsaved) {
      setError(
        "Some answers could not be saved. Check your connection and try again.",
      );
      return false;
    }
    setError("");
    return true;
  }

  async function navigate(direction) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setBusy(true);
    try {
      const requirementId = requirements[index].id;
      if (!(await flushRequirement(requirementId))) return;
      logEvent({
        event_type: direction > 0 ? "requirement_next" : "requirement_previous",
        requirement_id: requirementId,
        event_data: { to: requirements[index + direction].id },
      });
      setConflict("");
      setIndex(index + direction);
    } finally {
      navigatingRef.current = false;
      setBusy(false);
    }
  }

  async function finish(timedOut = false) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setBusy(true);
    try {
      if (timedOut) {
        for (const requirement of requirements) {
          if (!(await flushRequirement(requirement.id))) return;
        }
      } else {
        if (!(await flushRequirement(requirements[index].id))) return;

        const firstIncomplete = requirements.findIndex(
          (requirement) =>
            !hasCompleteResponse(answersRef.current, requirement.id),
        );
        if (firstIncomplete !== -1) {
          const incompleteId = requirements[firstIncomplete].id;
          const missing = missingReasoning(answersRef.current, incompleteId);
          setIndex(firstIncomplete);
          setConflict("");
          setError(
            missing.length
              ? `Requirement ${incompleteId}: Please provide reasoning for each selected violation (${missing.join(", ")}).`
              : `Requirement ${incompleteId}: Please select A1 or at least one violated criterion before continuing.`,
          );
          return;
        }
      }

      if (!onContinue) {
        setError("The stage continuation handler was not provided.");
        return;
      }
      await onContinue(timedOut ? "timeout" : "manual");
    } catch (err) {
      setError(`Unable to continue: ${errorMessage(err)}`);
    } finally {
      navigatingRef.current = false;
      setBusy(false);
    }
  }

  // When the time limit expires, save any partial answers and advance once.
  useEffect(() => {
    if (
      !autoAdvance ||
      loading ||
      busy ||
      !requirements.length ||
      !survey ||
      timeoutAttemptedRef.current
    )
      return;

    timeoutAttemptedRef.current = true;
    void finish(true);
  }, [autoAdvance, loading, busy, requirements.length, survey]);

  // Tell the parent which requirement is currently displayed.
  const currentRequirementId = requirements[index]?.id ?? null;
  useEffect(() => {
    onRequirementChange?.(currentRequirementId);
  }, [currentRequirementId, onRequirementChange]);

  if (loading)
    return (
      <div className="manual-review__loading" role="status">
        Loading manual review...
      </div>
    );
  if (!survey || !requirements.length) {
    return (
      <div className="manual-review__loading error-msg" role="alert">
        {error || "Manual review could not be loaded."}
      </div>
    );
  }

  const requirement = requirements[index];
  const current = answers[requirement.id] ?? {};
  const responded = requirements.filter((req) =>
    hasCompleteResponse(answers, req.id),
  ).length;
  const choices = Object.entries(survey.choices);
  const question = (
    survey.question || "Which criteria does PLACEHOLDER fail to satisfy?"
  )
    .replaceAll("PLACEHOLDER", requirement.id)
    .replaceAll("{requirement_id}", requirement.id);

  return (
    <StudyReviewLayout
      className="manual-review"
      title="Manual review"
      description="Review each requirement against the INCOSE quality criteria."
      requirementIndex={index + 1}
      requirementCount={requirements.length}
      progressText={`${responded} of ${requirements.length} answered`}
      progressValue={responded}
      progressMax={requirements.length}
      scrollKey={index}
      timer={timer}
      footerStatus={
        <div className="manual-review__feedback">
          {error && (
            <p className="manual-review__error error-msg" role="alert">
              {error}
            </p>
          )}
          <span aria-live="polite">
            {pendingSaves > 0
              ? "Saving changes..."
              : error
                ? "Please retry the save"
                : "Changes saved automatically"}
          </span>
        </div>
      }
      footerActions={
        <div className="manual-review__navigation">
          <button
            type="button"
            className="manual-review__back"
            onClick={() => navigate(-1)}
            disabled={busy || index === 0}
          >
            ← Previous
          </button>
          {autoAdvance ? (
            <button
              type="button"
              className="btn-primary manual-review__next"
              onClick={() => finish(true)}
              disabled={busy}
            >
              {busy ? "Finishing..." : "Continue (time expired) →"}
            </button>
          ) : index < requirements.length - 1 ? (
            <button
              type="button"
              className="btn-primary manual-review__next"
              onClick={() => navigate(1)}
              disabled={busy}
            >
              Next requirement →
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary manual-review__next"
              onClick={() => finish()}
              disabled={busy}
            >
              Finish manual review →
            </button>
          )}
        </div>
      }
    >
      <section
        className="manual-review__requirement"
        aria-labelledby="manual-requirement-title"
      >
        <div className="manual-review__section-topline">
          <span className="manual-review__section-label">
            Current requirement
          </span>
          <span
            className={`manual-review__status${hasCompleteResponse(answers, requirement.id) ? " manual-review__status--answered" : ""}`}
          >
            {hasCompleteResponse(answers, requirement.id)
              ? "Answered"
              : "Not answered"}
          </span>
        </div>
        <h2 id="manual-requirement-title">Requirement {requirement.id}</h2>
        <p className="manual-review__requirement-text">{requirement.text}</p>
      </section>

      <section
        className="manual-review__survey"
        aria-labelledby="manual-survey-title"
      >
        <div className="manual-review__survey-intro">
          <h2 id="manual-survey-title">{question}</h2>
          {survey.question_info && <p>{survey.question_info}</p>}
          <p className="manual-review__survey-hint">
            Every selected violation requires an explanation before finishing.
            A1 does not require an explanation and cannot be combined with other
            choices.
          </p>
        </div>

        {conflict && (
          <div className="manual-review__alert" role="alert">
            {conflict}
          </div>
        )}

        <div className="manual-review__criteria">
          {choices.map(([criterionId, label]) => (
            <CriterionOption
              key={`${requirement.id}:${criterionId}`}
              criterionId={criterionId}
              label={label}
              selected={current[criterionId]?.selected ?? false}
              notes={current[criterionId]?.notes ?? ""}
              disabled={busy}
              onSelectedChange={(checked) =>
                changeSelection(requirement.id, criterionId, checked)
              }
              onNotesChange={(notes) =>
                changeNotes(requirement.id, criterionId, notes)
              }
              onNotesFocus={() =>
                logEvent({
                  event_type: "reasoning_focused",
                  requirement_id: requirement.id,
                  criterion_id: criterionId,
                })
              }
              onNotesBlur={() => {
                logEvent({
                  event_type: "reasoning_blurred",
                  requirement_id: requirement.id,
                  criterion_id: criterionId,
                });
                saveNotes(requirement.id, criterionId);
              }}
            />
          ))}
        </div>
      </section>
    </StudyReviewLayout>
  );
}
