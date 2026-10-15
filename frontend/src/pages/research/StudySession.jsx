import { useState, useParams, useEffect } from "react";
import ConfidenceSurvey from "./ConfidenceSurvey";
import ContextViewer from "./ContextViewer";
import ManualReview from "./ManualReview";
import CompletionPage from "./CompletionPage";

export default function StudySession() {
  const { sessionId } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`/api/study/sessions/${sessionId}`)
      .then((res) => setSession(res.data))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) return <div>Loading...</div>;
  if (!session) return <div>Could not load session.</div>;

  switch (session.current_stage) {
    case "confidence":
      return <ConfidenceSurvey />;

    case "context":
      return <ContextViewer />;

    case "manual_review":
      return <ManualReview />;

    case "ai_review":
      return <div>to do</div>;

    case "complete":
      return <CompletionPage />;

    default:
      return <div>Unknown stage</div>;
  }
}
