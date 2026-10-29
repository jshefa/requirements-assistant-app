import { Link } from "react-router-dom";
import "./CompletionPage.css";

export default function CompletionPage() {
  return (
    <main className="completion-page">
      <section className="completion-card" aria-labelledby="completion-title">
        <h1 id="completion-title" className="completion-card__heading">
          <svg
            className="completion-card__check"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="m8 12 2.5 2.5L16 9" />
          </svg>
          Study complete
        </h1>
        <p className="completion-card__message">
          Thank you for participating. You've completed all parts of the study.
        </p>

        <div className="completion-card__notice">
          <p>
            Please do not complete the study again. If your professor provided
            additional instructions, follow those now.
          </p>
        </div>

        <Link className="btn-primary completion-home-link" to="/">
          Return to start
        </Link>
      </section>
    </main>
  );
}
