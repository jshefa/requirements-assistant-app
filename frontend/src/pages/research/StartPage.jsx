import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createStudySession } from "../../api/studySessions";
import "./StartPage.css";

const CLASS_SECTIONS = [
  "ISE-2804 Section 1",
  "ISE-2804 Section 2",
  "ISE-5804 Breakout Room 1",
  "ISE-5804 Breakout Room 2",
];

export default function StartPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [classSection, setClassSection] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedName = fullName.trim();
    if (!trimmedName || !classSection || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const session = await createStudySession(trimmedName, classSection);
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
      <img
        className="study-start-logo"
        src="/stse-lab-logo.png"
        alt="STSE Lab — Socio-Technical Systems Engineering Laboratory"
      />
      <section className="study-start-card" aria-labelledby="study-start-title">
        <div className="study-start-header">
          <h1 id="study-start-title">STSELab Research Study</h1>
          <p className="study-start-subtitle">
            Enter your information below to begin the requirements evaluation
            study.
          </p>
        </div>

        <form className="study-start-form" onSubmit={handleSubmit}>
          <div className="study-start-field">
            <label htmlFor="study-participant-name">Full Name</label>
            <input
              id="study-participant-name"
              type="text"
              autoComplete="username"
              placeholder="Enter your Full Name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
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
                <option key={section} value={section}>
                  {section}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="study-start-error" role="alert">
              {error}
            </p>
          )}

          <button
            className="btn-primary study-start-submit"
            type="submit"
            disabled={submitting || !fullName.trim() || !classSection}
          >
            {submitting ? "Starting study..." : "Start study"}
          </button>
        </form>
      </section>
    </main>
  );
}
