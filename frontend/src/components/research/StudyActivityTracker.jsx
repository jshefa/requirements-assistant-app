import { useEffect, useRef } from "react";
import { logStudyEvent } from "../../api/studyLogging";

// Logs visibility changes and browser reloads for an active study session.
// The review pages supply their currently displayed requirement through a
// ref owned by StudySession; this component does not render any UI.
export default function StudyActivityTracker({
  sessionId,
  stage,
  activityContextRef,
}) {
  // React Strict Mode can rerun effects in development. Report the reload once.
  const reloadReportedRef = useRef(false);
  useEffect(() => {
    if (!sessionId || !stage || stage === "completed") return;

    function report(eventType) {
      const context = activityContextRef.current;
      const requirementId =
        context?.stage === stage ? context.requirementId : null;

      logStudyEvent(sessionId, {
        event_type: eventType,
        ...(requirementId ? { requirement_id: requirementId } : {}),
        event_data: { client_stage: stage },
      }).catch((err) => console.warn("Study activity log failed:", err));
    }

    function onVisibilityChange() {
      report(
        document.visibilityState === "hidden" ? "tab_hidden" : "tab_visible",
      );
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    if (!reloadReportedRef.current) {
      reloadReportedRef.current = true;
      if (
        performance.getEntriesByType?.("navigation")?.[0]?.type === "reload"
      ) {
        report("page_refreshed");
      }
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [sessionId, stage, activityContextRef]);

  return null;
}
