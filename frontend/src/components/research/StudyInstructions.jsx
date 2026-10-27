import { useState } from "react";
import "./StudyInstructions.css";

// Shared instructions screen for the different study stages.
// The parent supplies the wording and advances the session.
export default function StudyInstructions({
  title,
  description,
  buttonText = "Continue",
  onContinue,
}) {
  const [continuing, setContinuing] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    if (continuing) return;

    setContinuing(true);
    setError("");

    try {
      await onContinue();
    } catch (err) {
      console.error(err);
      setError("Could not continue. Please try again.");
    } finally {
      setContinuing(false);
    }
  }

  return (
    <main className="study-instructions">
      <section
        className="study-instructions__card"
        aria-labelledby="study-instructions-title"
      >
        <h1 id="study-instructions-title">{title}</h1>
        <p className="study-instructions__description">{description}</p>

        {error && (
          <p className="study-instructions__error error-msg" role="alert">
            {error}
          </p>
        )}

        <div className="study-instructions__footer">
          <button
            type="button"
            className="btn-primary study-instructions__button"
            onClick={handleContinue}
            disabled={continuing}
          >
            {continuing ? "Continuing..." : buttonText}
          </button>
        </div>
      </section>
    </main>
  );
}
