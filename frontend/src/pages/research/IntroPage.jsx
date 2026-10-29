import { useState } from "react";
import "./IntroPage.css";

export default function IntroPage({ onContinue }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function handleStart() {
    setStarting(true);
    setError("");

    try {
      await onContinue();
    } catch (err) {
      console.error(err);
      setError("Could not start the study. Please try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="study-intro">
      <div className="study-intro-card">
        <h1>Before You Begin</h1>

        <p>
          You are about to begin a series of activities for this research study.
          Please read the following instructions before continuing.
        </p>

        <ul>
          <li>
            Please do not navigate away from the study or close this browser tab
            while completing the activities.
          </li>
          <li>
            Only begin when you are ready to complete the study without
            interruption.
          </li>
          <li>
            For some sections of this study, you will have a time limit. Please
            keep a steady pace in order to finish on time.
          </li>
        </ul>

        <p>When you are ready, click the button below to begin.</p>

        {error && <p className="error-msg">{error}</p>}

        <button
          type="button"
          className="btn-primary study-intro-button"
          onClick={handleStart}
          disabled={starting}
        >
          {starting ? "Starting..." : "Begin Study"}
        </button>
      </div>
    </main>
  );
}
