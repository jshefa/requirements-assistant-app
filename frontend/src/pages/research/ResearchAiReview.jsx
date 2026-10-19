import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { getStudyAnalysis, retryStudyAnalysis } from "../../api/studySessions";
import {
  getAIDecisions,
  saveAIDecision,
  logStudyEvent,
} from "../../api/studyLogging";
import RequirementCard from "../../components/RequirementCard";
import StudyReviewLayout from "../../components/research/StudyReviewLayout";
import "../ReviewPage.css";
import "./ManualReview.css";
import AiAnalysisFailed from "../../components/research/AiAnalysisFailed";

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
  onAnalysisReady,
  autoAdvance = false,
  timer,
}) {
  const { sessionId: routeSessionId } = useParams();
  const sessionId = providedSessionId ?? routeSessionId;

  const [analysis, setAnalysis] = useState(null);
  const [analysisId, setAnalysisId] = useState(null);
  const [status, setStatus] = useState("pending");
  const [feedbackState, setFeedbackState] = useState({});
  const [index, setIndex] = useState(0); // req being displayed
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState("");
  const [retryError, setRetryError] = useState("");
  const [requestingRetry, setRequestingRetry] = useState(false);
  const [retryPollToken, setRetryPollToken] = useState(0);

  const feedbackRef = useRef({});
  const savedRef = useRef({});
  const saveQueueRef = useRef(Promise.resolve());
  const logQueueRef = useRef(Promise.resolve());
  const navigatingRef = useRef(false);
  const timeoutAttemptedRef = useRef(false);
  // After a retry is accepted, the old failed row may remain the latest
  // until the background task starts and inserts the new analysis row.
  const lastFailedAnalysisIdRef = useRef(null);
  const waitingForNewAnalysisRef = useRef(null);

  useEffect(() => {
    if (!sessionId) {
      setError("Missing study session ID.");
      setLoading(false);
      return;
    }

    let active = true;
    let pollTimer; // polls to check if analysis is ready until it is

    async function loadAnalysis() {
      try {
        const data = await getStudyAnalysis(sessionId);
        if (!active) return;
        if (data.status === "failed") {
          // The retry endpoint schedules a background task. Until it starts,
          // this endpoint may still return the *previous* failed analysis.
          if (waitingForNewAnalysisRef.current === data.analysis_id) {
            setStatus("pending");
            setLoading(false);
            pollTimer = setTimeout(loadAnalysis, POLL_INTERVAL_MS);
            return;
          }

          waitingForNewAnalysisRef.current = null;
          lastFailedAnalysisIdRef.current = data.analysis_id;
          setStatus("failed");
          setError(data.error || "The AI analysis could not be completed.");
          setLoading(false);
          return;
        }

        // A new attempt is underway, or the analysis is ready.
        waitingForNewAnalysisRef.current = null;
        setStatus(data.status);
        setError("");

        if (data.status === "pending" || data.status === "running") {
          setLoading(false);
          pollTimer = setTimeout(loadAnalysis, POLL_INTERVAL_MS);
          return;
        }

        if (
          data.status !== "completed" ||
          !Array.isArray(data.result?.requirements)
        ) {
          throw new Error("The server returned an invalid AI analysis.");
        }

        // restore decisions so participants can refresh without losing progress
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
        onAnalysisReady?.(data.result.timestamp || new Date().toISOString());

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
  }, [sessionId, retryPollToken]);

  async function handleRetryAnalysis() {
    if (requestingRetry) return;

    setRequestingRetry(true);
    setRetryError("");
    try {
      await retryStudyAnalysis(sessionId);
      waitingForNewAnalysisRef.current = lastFailedAnalysisIdRef.current;
      setStatus("pending");
      setError("");
      // Restart the existing analysis-polling effect after retry is accepted.
      setRetryPollToken((value) => value + 1);
    } catch (err) {
      setRetryError(`Could not restart AI analysis: ${errorMessage(err)}`);
    } finally {
      setRequestingRetry(false);
    }
  }

  // logs events (clicking around, not feedback changes)
  // preserves the logging order of events, and finish pending logs before advancing stages.
  function logEvent(event) {
    const job = logQueueRef.current
      .catch(() => {})
      .then(() => logStudyEvent(sessionId, event));
    logQueueRef.current = job;
    job.catch((err) => console.warn("Study interaction log failed:", err));
    return job;
  }

  // logs tab in/out and refreshes
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

  // saves feedback change if there was an actual change
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

  function handleFeedbackChange(key, requirementId, feedback) {
    const previous = feedbackRef.current[key];
    feedbackRef.current = { ...feedbackRef.current, [key]: feedback };
    setFeedbackState(feedbackRef.current);

    // button selections are logged immediately. suggestions and text edits saved on blur/navigation to avoid unecessary logs
    if (
      feedback.user_action !== previous?.user_action &&
      feedback.user_action !== "suggest"
    ) {
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

  async function flushUnsaved(timedOut = false) {
    // Also catches edited text that has not been blurred yet, or a failed save.
    for (const req of analysis.requirements) {
      for (const ev of req.criteria_evaluations || []) {
        const key = `${req.req_id}-${ev.criterion_id}`;
        const feedback = feedbackRef.current[key];
        if (
          ["suggest", "modify"].includes(feedback?.user_action) &&
          !feedback.user_text?.trim()
        ) {
          if (timedOut) continue;
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

  // move to next/previous requirement
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

  // submits review, but only if every violation has been reviewed
  async function finish(timedOut = false) {
    if (navigatingRef.current) return;
    navigatingRef.current = true;
    setBusy(true);
    try {
      if (!timedOut) {
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
      }
      if (!(await flushUnsaved(timedOut))) return;
      await logQueueRef.current.catch(() => {});
      if (!onContinue)
        throw new Error("Study continuation handler was not provided.");
      await onContinue(timedOut ? "timeout" : "manual");
    } catch (err) {
      setError(`Could not finish AI review: ${errorMessage(err)}`);
    } finally {
      navigatingRef.current = false;
      setBusy(false);
    }
  }

  // Once time expires, save any completed decisions and advance automatically.
  useEffect(() => {
    if (
      !autoAdvance ||
      loading ||
      busy ||
      !analysis ||
      timeoutAttemptedRef.current
    )
      return;

    timeoutAttemptedRef.current = true;
    void finish(true);
  }, [autoAdvance, loading, busy, analysis]);

  if (loading)
    return (
      <div className="loading" role="status">
        Loading AI review...
      </div>
    );
  if (!analysis) {
    if (status === "failed")
      return (
        <AiAnalysisFailed
          message={error}
          retryError={retryError}
          retrying={requestingRetry}
          onRetry={handleRetryAnalysis}
        />
      );

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
    <StudyReviewLayout
      className="manual-review review-page"
      title="AI review"
      description="Review the AI's findings for each requirement."
      requirementIndex={index + 1}
      requirementCount={requirements.length}
      progressText={`${reviewed} of ${violations.length} AI findings reviewed`}
      progressValue={reviewed}
      progressMax={violations.length}
      scrollKey={index}
      timer={timer}
      footerStatus={
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
      }
      footerActions={
        <div className="manual-review__navigation">
          <button
            type="button"
            className="manual-review__back"
            disabled={busy || index === 0}
            onClick={() => move(-1)}
          >
            ← Previous
          </button>
          {autoAdvance ? (
            <button
              type="button"
              className="btn-primary manual-review__next"
              disabled={busy}
              onClick={() => finish(true)}
            >
              {busy ? "Finishing..." : "Continue (time expired) →"}
            </button>
          ) : index < requirements.length - 1 ? (
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
              onClick={() => finish()}
            >
              {busy ? "Finishing..." : "Finish AI review →"}
            </button>
          )}
        </div>
      }
    >
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
    </StudyReviewLayout>
  );
}
