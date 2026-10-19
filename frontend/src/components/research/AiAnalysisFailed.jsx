import "./AiAnalysisFailed.css";

// Only shown after the backend explicitly reports a failed AI analysis.
export default function AiAnalysisFailed({
  message,
  retryError,
  retrying,
  onRetry,
}) {
  return (
    <main className="ai-analysis-failed">
      <section
        className="ai-analysis-failed__card"
        aria-labelledby="ai-analysis-failed-title"
      >
        <div className="ai-analysis-failed__symbol" aria-hidden="true">
          !
        </div>
        <p className="ai-analysis-failed__eyebrow">AI review</p>
        <h1 id="ai-analysis-failed-title">AI analysis was unsuccessful</h1>
        <p className="ai-analysis-failed__description">
          We couldn't finish generating your AI review. You can try again
          without restarting your study session.
        </p>
        {message && <p className="ai-analysis-failed__detail">{message}</p>}
        {retryError && (
          <p className="ai-analysis-failed__error" role="alert">
            {retryError}
          </p>
        )}
        <button
          type="button"
          className="btn-primary ai-analysis-failed__retry"
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? "Starting new analysis..." : "Regenerate AI analysis"}
        </button>
        <p className="ai-analysis-failed__hint">
          This may take a minute. If it fails again, please notify your
          instructor.
        </p>
      </section>
    </main>
  );
}
