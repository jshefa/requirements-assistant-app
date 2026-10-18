import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { getStudyAnalysis } from "../../api/studySessions";
import {
  getAIDecisions,
  saveAIDecision,
  logStudyEvent,
} from "../../api/studyLogging";
import RequirementCard from "../../components/RequirementCard";
import "../ReviewPage.css";
import "./ManualReview.css";

// how often to check whether the analysis is ready (only polls when not already ready)
const POLL_INTERVAL_MS = 3000;

function errorMessage(error) {
  return (
    error?.response?.data?.detail || error?.message || "Something went wrong."
  );
}

function decisionFromFeedback(feedback) {
  if (!feedback?.user_action) return null;

  const decision =
    feedback.user_action === "modify" ? "substitute" : feedback.user_action;
  if (!["accept", "reject", "substitute", "suggest"].includes(decision))
    return null;

  const needsText = decision === "substitute" || decision === "suggest";
  const substitutedText = needsText ? feedback.user_text || "" : null;
  if (needsText && !substitutedText.trim()) return null;
  return { decision, substitutedText };
}

function sameDecision(a, b) {
  return (
    a?.decision === b?.decision && a?.substitutedText === b?.substitutedText
  );
}

export default function ResearchAiReview({
  sessionId: providedSessionId,
  onContinue,
}) {
  const { sessionId: routeSessionId } = useParams();
  const sessionId = providedSessionId ?? routeSessionId;

  const [analysis, setAnalysis] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [status, setStatus] = useState("pending");
  const [feedbackState, setFeedbackState] = useState({});
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState("");

  const feedbackRef = useRef({});
  const savedRef = useRef({});
  const saveQueueRef = useRef(Promise.resolve());
  const logQueueRef = useRef(Promise.resolve());
  const navigatingRef = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing study session ID.");
      setLoading(false);
      return;
    }

    let active = true;
    let pollTimer;

    async function loadAnalysis() {
      try {
        const data = await getStudyAnalysis(sessionId);
        if (!active) return;
        setStatus(data.status);

        if (data.status === "pending" || data.status === "running") {
          setLoading(false);
          pollTimer = setTimeout(loadAnalysis, POLL_INTERVAL_MS);
          return;
        }

        if (data.status === "failed") {
          setError(
            data.error ||
              "The AI analysis failed. Please notify the study administrator.",
          );
          setLoading(false);
          return;
        }

        if (
          data.status !== "completed" ||
          !Array.isArray(data.result?.requirements)
        ) {
          throw new Error("The server returned an invalid AI analysis.");
        }

        // Restore decisions so participants can safely refresh the page.
        const savedDecisions = await getAIDecisions(sessionId);
        if (!active) return;

        const restored = {};
        const confirmed = {};
        for (const req of data.result.requirements) {
          for (const ev of req.criteria_evaluations || []) {
            const key = `${req.req_id}-${ev.criterion_id}`;
            const row = savedDecisions.find(
              (item) =>
                item.analysis_id === data.analysis_id &&
                item.requirement_id === req.req_id &&
                item.criterion_id === ev.criterion_id,
            );

            restored[key] = {
              criterion_id: ev.criterion_id,
              user_action:
                row?.decision === "substitute" ? "modify" : row?.decision || "",
              user_text:
                row?.substituted_text ??
                (ev.satisfied ? "" : (ev.suggested_replacement ?? "")),
              notes: "",
            };
            if (row) {
              confirmed[key] = {
                decision: row.decision,
                substitutedText: ["substitute", "suggest"].includes(
                  row.decision,
                )
                  ? row.substituted_text
                  : null,
              };
            }
          }
        }

        feedbackRef.current = restored;
        savedRef.current = confirmed;
        setFeedbackState(restored);
        setAnalysis(data.result);
        setAnalysisId(data.analysis_id);

        const firstIncomplete = data.result.requirements.findIndex((req) =>
          (req.criteria_evaluations || []).some(
            (ev) =>
              !ev.satisfied &&
              !restored[`${req.req_id}-${ev.criterion_id}`]?.user_action,
          ),
        );
        setIndex(firstIncomplete < 0 ? 0 : firstIncomplete);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(`Could not load AI review: ${errorMessage(err)}`);
        setLoading(false);
      }
    }

    loadAnalysis();
    return () => {
      active = false;
      clearTimeout(pollTimer);
    };
  }, [sessionId]);

  // Preserve the order of interaction events, and finish pending logs before advancing stages.
  function logEvent(event) {
    const job = logQueueRef.current
      .catch(() => {})
      .then(() => logStudyEvent(sessionId, event));
    logQueueRef.current = job;
    job.catch((err) => console.warn("Study interaction log failed:", err));
    return job;
  }

  useEffect(() => {
    if (!sessionId) return;
    function visibilityChanged() {
      logStudyEvent(sessionId, {
        event_type: document.hidden ? "tab_hidden" : "tab_visible",
      }).catch((err) => console.warn("Study interaction log failed:", err));
    }
    document.addEventListener("visibilitychange", visibilityChanged);

    if (performance.getEntriesByType?.("navigation")?.[0]?.type === "reload") {
      logStudyEvent(sessionId, { event_type: "page_refreshed" }).catch((err) =>
        console.warn("Study interaction log failed:", err),
      );
    }

    return () =>
      document.removeEventListener("visibilitychange", visibilityChanged);
  }, [sessionId]);

  function queueSave(key, requirementId, criterionId, feedback) {
    const next = decisionFromFeedback(feedback);
    if (!next || !analysisId) return Promise.resolve();

    setPendingSaves((count) => count + 1);
    const job = saveQueueRef.current
      .catch(() => {})
      .then(async () => {
        if (sameDecision(savedRef.current[key], next)) return;
        await saveAIDecision(
          sessionId,
          analysisId,
          requirementId,
          criterionId,
          next.decision,
          next.substitutedText,
        );
        savedRef.current[key] = next;
      });

    saveQueueRef.current = job;
    job.then(
      () => setPendingSaves((count) => count - 1),
      (err) => {
        setPendingSaves((count) => count - 1);
        setError(`Could not save your decision: ${errorMessage(err)}`);
      },
    );
    return job;
  }

  function handleFeedbackChange(key, feedback) {
    const previous = feedbackRef.current[key];
    feedbackRef.current = { ...feedbackRef.current, [key]: feedback };
    setFeedbackState(feedbackRef.current);

    // Button selections are saved immediately. Suggestions and text edits wait for blur/navigation.
    if (
      feedback.user_action !== previous?.user_action &&
      feedback.user_action !== "suggest"
    ) {
      const requirementId = key.slice(0, key.lastIndexOf("-"));
      queueSave(key, requirementId, feedback.criterion_id, feedback).catch(
        () => {},
      );
    }
  }

  function identifyTextField(target) {
    if (target.id?.startsWith("replacement-")) {
      return {
        kind: "substitution",
        criterionId: target.id.slice("replacement-".length),
      };
    }
    if (target.id?.startsWith("suggestion-")) {
      return {
        kind: "suggestion",
        criterionId: target.id.slice("suggestion-".length),
      };
    }
    return null;
  }

  function handleTextFocus(event) {
    const field = identifyTextField(event.target);
    if (!field) return;
    logEvent({
      event_type: `ai_${field.kind}_focused`,
      requirement_id: analysis.requirements[index].req_id,
      criterion_id: field.criterionId,
    });
  }

  function handleTextBlur(event) {
    const field = identifyTextField(event.target);
    if (!field) return;

    const requirementId = analysis.requirements[index].req_id;
    const key = `${requirementId}-${field.criterionId}`;
    logEvent({
      event_type: `ai_${field.kind}_blurred`,
      requirement_id: requirementId,
      criterion_id: field.criterionId,
    });
    queueSave(
      key,
      requirementId,
      field.criterionId,
      feedbackRef.current[key],
    ).catch(() => {});
  }

  async function flushUnsaved() {
    // Also catches edited text that has not been blurred yet, or a failed save.
    for (const req of analysis.requirements) {
      for (const ev of req.criteria_evaluations || []) {
        const key = `${req.req_id}-${ev.criterion_id}`;
        const feedback = feedbackRef.current[key];
        if (
          ["suggest", "modify"].includes(feedback?.user_action) &&
          !feedback.user_text?.trim()
        ) {
          setError(
            `Please enter text for ${req.req_id} / ${ev.criterion_id}, or choose a different action.`,
          );
          return false;
        }
        const decision = decisionFromFeedback(feedback);
        if (decision && !sameDecision(savedRef.current[key], decision)) {
          queueSave(key, req.req_id, ev.criterion_id, feedback).catch(() => {});
        }
      }
    }

    await saveQueueRef.current.catch(() => {});
    const unsaved = analysis.requirements.some((req) =>
      (req.criteria_evaluations || []).some((ev) => {
        const key = `${req.req_id}-${ev.criterion_id}`;
        const decision = decisionFromFeedback(feedbackRef.current[key]);
        return decision && !sameDecision(savedRef.current[key], decision);
      }),
    );
    if (unsaved) {
      setError("Some decisions could not be saved. Please try again.");
      return false;
    }
    setError("");
    return true;
  }

  async function move(direction) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setBusy(true);
    try {
      if (!(await flushUnsaved())) return;
      logEvent({
        event_type: direction > 0 ? "requirement_next" : "requirement_previous",
        requirement_id: analysis.requirements[index].req_id,
        event_data: { to: analysis.requirements[index + direction].req_id },
      });
      setIndex(index + direction);
    } finally {
      navigatingRef.current = false;
      setBusy(false);
    }
  }

  async function finish() {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setBusy(true);
    try {
      const firstIncomplete = analysis.requirements.findIndex((req) =>
        (req.criteria_evaluations || []).some((ev) => {
          if (ev.satisfied) return false;
          const key = `${req.req_id}-${ev.criterion_id}`;
          return !decisionFromFeedback(feedbackRef.current[key]);
        }),
      );
      if (firstIncomplete !== -1) {
        setIndex(firstIncomplete);
        setError(
          "Please accept, reject, or substitute every AI-flagged violation before finishing.",
        );
        return;
      }
      if (!(await flushUnsaved())) return;
      await logQueueRef.current.catch(() => {});
      if (!onContinue)
        throw new Error("Study continuation handler was not provided.");
      await onContinue();
    } catch (err) {
      setError(`Could not finish AI review: ${errorMessage(err)}`);
    } finally {
      navigatingRef.current = false;
      setBusy(false);
    }
  }

  if (loading)
    return (
      <div className="loading" role="status">
        Loading AI review...
      </div>
    );
  if (!analysis) {
    if (error)
      return (
        <div className="error-msg" role="alert">
          {error}
        </div>
      );
    if (status === "pending" || status === "running") {
      return (
        <div className="loading" role="status">
          AI analysis is being prepared. This page will update automatically...
        </div>
      );
    }
    return (
      <div className="error-msg" role="alert">
        {error || "AI review is unavailable."}
      </div>
    );
  }

  const requirements = analysis.requirements;
  const requirement = requirements[index];
  const violations = requirements.flatMap((req) =>
    (req.criteria_evaluations || [])
      .filter((ev) => !ev.satisfied)
      .map((ev) => `${req.req_id}-${ev.criterion_id}`),
  );
  const reviewed = violations.filter((key) =>
    decisionFromFeedback(feedbackState[key]),
  ).length;

  return (
    <main className="review-page manual-review">
      <header className="review-header">
        <h1>AI review</h1>
        <p>Review the AI's findings for each requirement.</p>
        <p>
          Requirement {index + 1} of {requirements.length} · {reviewed} of{" "}
          {violations.length} AI findings reviewed
        </p>
      </header>

      <div
        className="requirements-list"
        onFocusCapture={handleTextFocus}
        onBlurCapture={handleTextBlur}
      >
        <RequirementCard
          key={requirement.req_id}
          requirement={requirement}
          feedbackState={feedbackState}
          onFeedbackChange={handleFeedbackChange}
        />
      </div>

      <footer className="manual-review__footer">
        <div className="manual-review__feedback">
          {error && (
            <p className="error-msg" role="alert">
              {error}
            </p>
          )}
          <span>
            {pendingSaves
              ? "Saving decisions..."
              : "Decisions saved automatically"}
          </span>
        </div>
        <div className="manual-review__navigation">
          <button
            type="button"
            className="manual-review__back"
            disabled={busy || index === 0}
            onClick={() => move(-1)}
          >
            ← Previous
          </button>
          {index < requirements.length - 1 ? (
            <button
              type="button"
              className="btn-primary manual-review__next"
              disabled={busy}
              onClick={() => move(1)}
            >
              Next requirement →
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary manual-review__next"
              disabled={busy}
              onClick={finish}
            >
              {busy ? "Finishing..." : "Finish AI review →"}
            </button>
          )}
        </div>
      </footer>
    </main>
  );
}
