import { Link } from "react-router-dom";
import "./CompletionPage.css";

export default function CompletionPage() {
  return (
    <main className="completion-page">
      <div className="completion-card">
        <h1>Study Complete</h1>
        <p>
          Thank you for participating! You have completed all parts of the
          study. Do not redo the experiment.
        </p>
        <p>
          Please follow any additional instructions provided by your professor.
        </p>
        <Link className="completion-home-link" to="/">
          Return to Start
        </Link>
      </div>
    </main>
  );
}
