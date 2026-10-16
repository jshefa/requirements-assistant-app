import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStudySession } from "../../api/studySessions";
import "./StartPage.css";

const CLASS_SECTIONS = [
  { value: "undergrad_1", label: "Undergraduate - Section 1" },
  { value: "undergrad_2", label: "Undergraduate - Section 2" },
  { value: "grad_1", label: "Graduate - Section 1" },
  { value: "grad_2", label: "Graduate - Section 2" },
];

export default function StartPage() {
  const navigate = useNavigate();
  const [pid, setPid] = useState("");
  const [classSection, setClassSection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedPid = pid.trim();
    if (!trimmedPid || !classSection || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const session = await createStudySession(trimmedPid, classSection);
      navigate(`/session/${session.id}`);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Unable to start the study. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="study-start-page">
      <section className="study-start-card" aria-labelledby="study-start-title">
        <div className="study-start-header">
          <p className="study-start-eyebrow">Research study</p>
          <h1 id="study-start-title">Get started</h1>
          <p className="study-start-subtitle">
            Enter your information below to begin the requirements evaluation
            study.
          </p>
        </div>

        <form className="study-start-form" onSubmit={handleSubmit}>
          <div className="study-start-field">
            <label htmlFor="study-participant-pid">VT PID</label>
            <input
              id="study-participant-pid"
              type="text"
              autoComplete="username"
              placeholder="Enter your VT PID"
              value={pid}
              onChange={(event) => setPid(event.target.value)}
              disabled={submitting}
              required
            />
          </div>

          <div className="study-start-field">
            <label htmlFor="study-class-section">Class section</label>
            <select
              id="study-class-section"
              value={classSection}
              onChange={(event) => setClassSection(event.target.value)}
              disabled={submitting}
              required
            >
              <option value="" disabled>
                Select your class section
              </option>
              {CLASS_SECTIONS.map((section) => (
                <option key={section.value} value={section.value}>
                  {section.label}
                </option>
              ))}
            </select>
            <p className="study-start-hint">
              Your class section determines which study activities you will
              complete.
            </p>
          </div>

          {error && (
            <p className="study-start-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="btn-primary study-start-submit"
            type="submit"
            disabled={submitting || !pid.trim() || !classSection}
          >
            {submitting ? "Starting study..." : "Start study"}
          </button>
        </form>
      </section>
    </main>
  );
}
