import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import ConfidenceSurvey from "./ConfidenceSurvey";
import ContextViewer from "./ContextViewer";
import ManualReview from "./ManualReview";
import CompletionPage from "./CompletionPage";
import { advanceStudySession, getStudySession } from "../../api/studySessions";
import IntroPage from "./IntroPage";

export default function StudySession() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  async function handleAdvance() {
    await advanceStudySession(sessionId);
    const updatedSession = await getStudySession(sessionId);
    setSession(updatedSession);
  }

  if (loading) return <div>Loading...</div>;
  if (error || !session) return <div>Could not load session.</div>;

  const config = session.config;

  switch (session.current_stage) {
    case "intro":
      return <IntroPage onContinue={handleAdvance} />;

    case "confidence":
      return <ConfidenceSurvey />;

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
      return <ManualReview onContinue={handleAdvance} />;

    case "ai_review":
      return <div>to do</div>;

    case "completed":
      return <CompletionPage />;

    default:
      return <div>Unknown stage</div>;
  }
}
