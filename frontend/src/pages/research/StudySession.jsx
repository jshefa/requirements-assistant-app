import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import ConfidenceSurvey from "./ConfidenceSurvey";
import ContextViewer from "./ContextViewer";
import ManualReview from "./ManualReview";
import CompletionPage from "./CompletionPage";
import { advanceStudySession, getStudySession } from "../../api/studySessions";
import IntroPage from "./IntroPage";
import ResearchAiReview from "./ResearchAiReview";
import StageTimer from "../../components/research/StageTimer";
import StudyInstructions from "../../components/research/StudyInstructions";
import StudyActivityTracker from "../../components/research/StudyActivityTracker";

export default function StudySession() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [timedOutStage, setTimedOutStage] = useState(null);
  const [aiReadyAt, setAiReadyAt] = useState(null);

  const activityContextRef = useRef({ stage: null, requirementId: null });

  const reportManualRequirement = useCallback((requirementId) => {
    activityContextRef.current = { stage: "manual_review", requirementId };
  }, []);

  const reportAIRequirement = useCallback((requirementId) => {
    activityContextRef.current = { stage: "ai_review", requirementId };
  }, []);

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

  function renderCurrentStage() {
    switch (session.current_stage) {
      case "intro":
        return <IntroPage onContinue={handleAdvance} />;

      case "confidence_instructions":
        return (
          <StudyInstructions
            title="Requirements Quality Assessment: Human Performance, Human–AI Teaming, and User Perceptions"
            description="This survey asks about your background and perceptions regarding using the AI prototype to evaluate engineering requirements. Requirements quality assessment (RQA) means evaluating requirements against the INCOSE quality criteria.

Answer based on your own experience. There are no right or wrong answers. Select one response per question unless otherwise stated. You may skip any question you do not wish to answer."
            buttonText="Start Survey"
            onContinue={handleAdvance}
          />
        );

      case "confidence":
        return (
          <ConfidenceSurvey
            sessionId={sessionId}
            phase="pre"
            onContinue={handleAdvance}
          />
        );

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

      case "manual_instructions": {
        const description = `For the next section, you will independently evaluate requirements based off of the provided INCOSE criteria.

          For each requirement, select all criteria that you believe it violates. If you think the requirement has no issues, then select 'No Issues Found'.
          
          For this section you will have ${config.manual_review_max_minutes > 0 ? `${config.manual_review_max_minutes} minutes. Please ensure a steady pace in order to finish in time.` : "no time limit, but please ensure a steady pace."} `;

        return (
          <StudyInstructions
            title="Manual Requirements Analysis Instructions"
            description={description}
            buttonText="Start Manual Review"
            onContinue={handleAdvance}
          />
        );
      }

      case "manual_review":
        return (
          <ManualReview
            onRequirementChange={reportManualRequirement}
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

      case "ai_instructions": {
        return (
          <StudyInstructions
            title="AI Review Instructions"
            description={`For this section, you will review violations generated by the AI prototype. 
            
            For each violation, you can either accept, reject, or modify the violation. For criteria where the AI found no violations, you can select 'Suggest a change anyway' to mark your own.
          
            For this section you will have ${config.ai_review_max_minutes > 0 ? `${config.ai_review_max_minutes} minutes. Please ensure a steady pace in order to finish in time.` : "no time limit, but please ensure a steady pace."}`}
            buttonText="Start AI Review"
            onContinue={handleAdvance}
          />
        );
      }

      case "ai_review": {
        const stageStartMs = new Date(session.stage_started_at).getTime();
        const readyMs = aiReadyAt ? new Date(aiReadyAt).getTime() : NaN;
        const timerStart =
          aiReadyAt && Number.isFinite(readyMs)
            ? new Date(Math.max(stageStartMs, readyMs)).toISOString()
            : null;
        return (
          <ResearchAiReview
            onRequirementChange={reportAIRequirement}
            sessionId={sessionId}
            onContinue={handleAdvance}
            onAnalysisReady={(timestamp) => setAiReadyAt(timestamp)}
            autoAdvance={timedOutStage === "ai_review"}
            showManualAssessment={["human_ai", "grad_human_ai"].includes(
              session.experiment_group,
            )}
            timer={
              timerStart &&
              Number.isFinite(config.ai_review_max_minutes) && (
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

      case "post_confidence":
        return (
          <ConfidenceSurvey
            sessionId={sessionId}
            phase="post"
            onContinue={handleAdvance}
          />
        );

      case "completed":
        return <CompletionPage />;

      default:
        return <div>Unknown stage</div>;
    }
  }

  return (
    <>
      <StudyActivityTracker
        sessionId={sessionId}
        stage={session.current_stage}
        activityContextRef={activityContextRef}
      />
      {renderCurrentStage()}
    </>
  );
}
