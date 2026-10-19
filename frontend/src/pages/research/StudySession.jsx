import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import ConfidenceSurvey from "./ConfidenceSurvey";
import ContextViewer from "./ContextViewer";
import ManualReview from "./ManualReview";
import CompletionPage from "./CompletionPage";
import { advanceStudySession, getStudySession } from "../../api/studySessions";
import IntroPage from "./IntroPage";
import ResearchAiReview from "./ResearchAiReview";
import StageTimer from "../../components/research/StageTimer";

export default function StudySession() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [timedOutStage, setTimedOutStage] = useState(null);
  const [aiReadyAt, setAiReadyAt] = useState(null);

  useEffect(() => {
    async function loadSession() {
      setLoading(true);
      setError("");

      try {
        const data = await getStudySession(sessionId);
        setSession(data);
      } catch (err) {
        console.error(err);
        setError("Could not load session.");
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, [sessionId]);

  // advance to next stage in experiment
  async function handleAdvance(completionReason = "manual") {
    const reason = completionReason === "timeout" ? "timeout" : "manual"; // avoid react events being passed as reason
    await advanceStudySession(sessionId, reason);
    const updatedSession = await getStudySession(sessionId);
    setSession(updatedSession);
    setTimedOutStage(null);
    setAiReadyAt(null);
  }

  if (loading) return <div>Loading...</div>;
  if (error || !session) return <div>Could not load session.</div>;

  const config = session.config;

  switch (session.current_stage) {
    case "intro":
      return <IntroPage onContinue={handleAdvance} />;

    case "confidence":
      return <ConfidenceSurvey onContinue={handleAdvance} />;

    case "reading": {
      let minReadMinutes = config.timed_read_groups.includes(
        session.experiment_group,
      )
        ? config.min_read_minutes
        : 0;
      console.log(`min read mins : ${minReadMinutes}`);
      return (
        <ContextViewer
          minReadMinutes={minReadMinutes}
          stageStartedAt={session.stage_started_at}
          onContinue={handleAdvance}
        />
      );
    }

    case "manual_review":
      return (
        <ManualReview
          sessionId={sessionId}
          onContinue={handleAdvance}
          autoAdvance={timedOutStage === "manual_review"}
          timer={
            Number.isFinite(config.manual_review_max_minutes) && (
              <StageTimer
                startedAt={session.stage_started_at}
                durationMinutes={config.manual_review_max_minutes}
                graceMinutes={config.timer_grace_period}
                onExpired={() => setTimedOutStage("manual_review")}
              />
            )
          }
        />
      );

    case "ai_review": {
      const stageStartMs = new Date(session.stage_started_at).getTime();
      const readyMs = aiReadyAt ? new Date(aiReadyAt).getTime() : NaN;
      const timerStart =
        aiReadyAt && Number.isFinite(readyMs)
          ? new Date(Math.max(stageStartMs, readyMs)).toISOString()
          : null;
      return (
        <ResearchAiReview
          sessionId={sessionId}
          onContinue={handleAdvance}
          onAnalysisReady={(timestamp) => setAiReadyAt(timestamp)}
          autoAdvance={timedOutStage === "ai_review"}
          timer={
            timerStart && Number.isFinite(config.ai_review_max_minutes) && (
              <StageTimer
                startedAt={timerStart}
                durationMinutes={config.ai_review_max_minutes}
                graceMinutes={config.timer_grace_period}
                onExpired={() => setTimedOutStage("ai_review")}
              />
            )
          }
        />
      );
    }
    case "completed":
      return <CompletionPage />;

    default:
      return <div>Unknown stage</div>;
  }
}
