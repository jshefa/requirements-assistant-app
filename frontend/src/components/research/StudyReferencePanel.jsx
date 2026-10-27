import { useEffect, useRef, useState } from "react";

import { getAnalysisSurvey, getStudyMaterials } from "../../api/studyMaterials";
import { getManualEvals } from "../../api/studyLogging";
import "./StudyReferencePanel.css";

// Read-only reference materials for manual and AI review. The manual assessment
// is shown only to groups that completed it before reaching AI review.
export default function StudyReferencePanel({
  sessionId,
  requirementId,
  showManualAssessment = false,
}) {
  const [tab, setTab] = useState("materials");
  const [materials, setMaterials] = useState(null);
  const [manualEvals, setManualEvals] = useState([]);
  const [criteria, setCriteria] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [imageExpanded, setImageExpanded] = useState(false);
  const bodyRef = useRef(null);
  const imageDialogRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    const requests = [getStudyMaterials()];
    if (showManualAssessment) {
      requests.push(getManualEvals(sessionId), getAnalysisSurvey());
    }

    Promise.all(requests)
      .then(([studyMaterials, savedEvals, surveyResponse]) => {
        if (!active) return;
        setMaterials(studyMaterials);
        if (showManualAssessment) {
          setManualEvals(savedEvals);
          setCriteria((surveyResponse.analysis_survey ?? surveyResponse).choices ?? {});
        }
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.detail || err.message || "Unable to load references.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [sessionId, showManualAssessment]);

  const conopsImageUrl = materials?.conops_image_url
    ? `${import.meta.env.VITE_API_URL || ""}${materials.conops_image_url}`
    : null;

  // The native dialog keeps the enlarged image above the page and handles Escape.
  useEffect(() => {
    const dialog = imageDialogRef.current;
    if (!dialog) return;
    if (imageExpanded && !dialog.open) dialog.showModal();
    if (!imageExpanded && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [imageExpanded, conopsImageUrl]);

  function selectTab(nextTab) {
    setTab(nextTab);
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }

  const requirementEvals = manualEvals.filter(
    (evaluation) => String(evaluation.requirement_id) === String(requirementId) && evaluation.selected,
  );

  return (
    <div className="study-reference-panel">
      {showManualAssessment && (
        <div className="study-reference-panel__tabs" role="group" aria-label="Reference section">
          <button
            type="button"
            className={tab === "materials" ? "study-reference-panel__tab--active" : ""}
            aria-pressed={tab === "materials"}
            onClick={() => selectTab("materials")}
          >
            Project Context
          </button>
          <button
            type="button"
            className={tab === "assessment" ? "study-reference-panel__tab--active" : ""}
            aria-pressed={tab === "assessment"}
            onClick={() => selectTab("assessment")}
          >
            My reviews
          </button>
        </div>
      )}

      <div className="study-reference-panel__body" ref={bodyRef}>
        {loading ? (
          <p role="status" className="study-reference-panel__message">Loading references...</p>
        ) : error ? (
          <p role="alert" className="study-reference-panel__message error-msg">{error}</p>
        ) : tab === "assessment" && showManualAssessment ? (
          <div className="study-reference-panel__assessment">
            <h3>Requirement {requirementId}</h3>
            <p className="study-reference-panel__hint">Your manual reviews from the first step.</p>
            {requirementEvals.length ? (
              <div className="study-reference-panel__assessments">
                {requirementEvals.map((evaluation) => (
                  <div className="study-reference-panel__assessment-card" key={evaluation.criterion_id}>
                    <div className="study-reference-panel__criterion">
                      <span className="study-reference-panel__criterion-id">Criterion {evaluation.criterion_id}</span>
                      {criteria[evaluation.criterion_id] && <strong>{criteria[evaluation.criterion_id]}</strong>}
                    </div>
                    <div className="study-reference-panel__answer">
                      <span className="study-reference-panel__answer-label">Your answer</span>
                      <p>
                        {evaluation.notes?.trim() || (evaluation.criterion_id === "A1"
                          ? "Selected (no explanation required)."
                          : "Selected (no explanation provided).")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="study-reference-panel__message">No criteria were selected for this requirement.</p>
            )}
          </div>
        ) : (
          <div className="study-reference-panel__document">
            <section className="study-reference-panel__document-section">
              <h3>Context</h3>
              <p className="study-reference-panel__text">{materials?.context}</p>
            </section>

            <section className="study-reference-panel__document-section">
              <h3>Concept of Operations (ConOps)</h3>
              <p className="study-reference-panel__text">{materials?.conops}</p>

              {conopsImageUrl && (
                <figure className="study-reference-panel__figure">
                  <button
                    type="button"
                    className="study-reference-panel__image-trigger"
                    onClick={() => setImageExpanded(true)}
                    aria-label="Enlarge Concept of Operations image"
                    title="Enlarge image"
                  >
                    <img
                      className="study-reference-panel__image"
                      src={conopsImageUrl}
                      alt="Concept of Operations reference figure"
                    />
                    <span className="study-reference-panel__image-zoom-hint" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="10.5" cy="10.5" r="6.5" />
                        <path d="m16 16 5 5M10.5 8v5M8 10.5h5" />
                      </svg>
                    </span>
                  </button>
                </figure>
              )}
            </section>
          </div>
        )}
      </div>

      {conopsImageUrl && (
        <dialog
          ref={imageDialogRef}
          className="study-reference-panel__lightbox"
          aria-label="Enlarged Concept of Operations image"
          onClose={() => setImageExpanded(false)}
          onClick={(event) => {
            if (event.target === event.currentTarget) setImageExpanded(false);
          }}
        >
          <div className="study-reference-panel__lightbox-header">
            <strong>Concept of Operations diagram</strong>
            <button
              type="button"
              onClick={() => setImageExpanded(false)}
              aria-label="Close enlarged image"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <img
            className="study-reference-panel__lightbox-image"
            src={conopsImageUrl}
            alt="Enlarged Concept of Operations reference figure"
          />
        </dialog>
      )}
    </div>
  );
}
