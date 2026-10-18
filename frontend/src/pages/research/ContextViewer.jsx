import { useEffect, useState } from "react";
import { getStudyMaterials } from "../../api/studyMaterials";
import "./ContextViewer.css";

export default function ContextViewer({
  onContinue,
  minReadMinutes = 0,
  stageStartedAt,
}) {
  const [materials, setMaterials] = useState(null); // requirements, context, conops, img link to show
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [advanceError, setAdvanceError] = useState("");
  const [advancing, setAdvancing] = useState(false);
  const [now, setNow] = useState(Date.now());

  // retrieve the configured study materials
  useEffect(() => {
    async function loadMaterials() {
      try {
        const data = await getStudyMaterials();
        setMaterials(data);
      } catch (err) {
        console.error(err);
        setLoadError("Could not load study materials.");
      } finally {
        setLoading(false);
      }
    }

    loadMaterials();
  }, []);

  // handles min time timer
  useEffect(() => {
    if (minReadMinutes <= 0) return;

    setNow(Date.now());

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [minReadMinutes]);

  const startTime = stageStartedAt ? Date.parse(stageStartedAt) : NaN;
  const timerValid = minReadMinutes <= 0 || Number.isFinite(startTime);

  const remainingSeconds =
    minReadMinutes > 0 && timerValid
      ? Math.max(
          0,
          Math.ceil((startTime + minReadMinutes * 60_000 - now) / 1000),
        )
      : 0;

  const canContinue = timerValid && remainingSeconds === 0 && !advancing;

  const timeDisplay = `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`;

  async function handleContinue() {
    if (!canContinue) return;

    setAdvancing(true);
    setAdvanceError("");

    try {
      await onContinue();
    } catch (err) {
      console.error(err);
      setAdvanceError(
        err.response?.data?.detail || "Could not advance. Please try again.",
      );
    } finally {
      setAdvancing(false);
    }
  }

  if (loading) return <div className="loading">Loading study materials...</div>;
  if (loadError) return <div className="error-msg">{loadError}</div>;
  if (!materials)
    return <div className="error-msg">No materials available.</div>;

  return (
    <main className="study-reading">
      <header className="study-reading-header">
        <h1>Study Materials</h1>
        <p>
          Please carefully read the following materials before continuing to the
          next part of the study.
        </p>
      </header>

      <div className="study-reading-card">
        <section className="study-reading-section">
          <h2>Context</h2>
          <p className="study-reading-text">{materials.context}</p>
        </section>

        <section className="study-reading-section">
          <h2>Concept of Operations (ConOps)</h2>

          {materials.conops_image_url && (
            <img
              className="study-reading-image"
              src={`${import.meta.env.VITE_API_URL || ""}materials.conops_image_url`}
              alt="Concept of Operations diagram"
            />
          )}

          <p className="study-reading-text">{materials.conops}</p>
        </section>

        <section className="study-reading-section">
          <h2>Requirements</h2>

          <ol className="study-reading-requirements">
            {materials.requirements.map((requirement) => (
              <li key={requirement.id} className="study-reading-requirement">
                <span className="study-reading-requirement-id">
                  {requirement.id}
                </span>
                <p className="study-reading-text">{requirement.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="study-reading-footer">
        {minReadMinutes > 0 && (
          <p className="study-reading-timer">
            {!timerValid
              ? "Could not determine reading start time. Please refresh."
              : remainingSeconds > 0
                ? `You may continue in ${timeDisplay}`
                : "Minimum reading time completed. You may continue."}
          </p>
        )}

        {advanceError && <p className="error-msg">{advanceError}</p>}

        <button
          type="button"
          className="btn-primary"
          onClick={handleContinue}
          disabled={!canContinue}
        >
          {advancing ? "Continuing..." : "Continue"}
        </button>
      </footer>
    </main>
  );
}
