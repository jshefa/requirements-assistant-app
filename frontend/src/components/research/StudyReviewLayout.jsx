import { useEffect, useRef } from "react";
import "./StudyReviewLayout.css";

// Shared presentation for the two study review modes. Each review owns its
// navigation, saving, validation, and other behavior.
export default function StudyReviewLayout({
  title,
  description,
  requirementIndex,
  requirementCount,
  progressText,
  progressValue,
  progressMax,
  timer,
  footerStatus,
  footerActions,
  scrollKey,
  children,
  className = "",
}) {
  const contentRef = useRef(null);

  // Start each newly selected requirement at the top of the scrolling area.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [scrollKey]);

  const progressPercent = progressMax > 0
    ? Math.min(100, Math.max(0, (progressValue / progressMax) * 100))
    : 0;

  return (
    <div className={`study-review-layout ${className}`.trim()}>
      <header className="study-review-layout__header">
        <div className="study-review-layout__heading">
          <div className="study-review-layout__heading-copy">
            <p className="study-review-layout__eyebrow">Requirements evaluation</p>
            <h1>{title}</h1>
            <p className="study-review-layout__description">{description}</p>
          </div>
          {timer && <div className="study-review-layout__timer">{timer}</div>}
          <div className="study-review-layout__progress-summary">
            <strong>Requirement {requirementIndex} of {requirementCount}</strong>
            <span>{progressText}</span>
          </div>
        </div>

        {progressMax > 0 && (
          <div
            className="study-review-layout__progress-track"
            role="progressbar"
            aria-label={progressText}
            aria-valuemin={0}
            aria-valuemax={progressMax}
            aria-valuenow={progressValue}
          >
            <div style={{ width: `${progressPercent}%` }} />
          </div>
        )}

      </header>

      <section
        ref={contentRef}
        className="study-review-layout__content"
        role="region"
        aria-label={`${title} content`}
      >
        <div className="study-review-layout__content-inner">{children}</div>
      </section>

      <footer className="study-review-layout__footer">
        <div className="study-review-layout__footer-status">{footerStatus}</div>
        <div className="study-review-layout__footer-actions">{footerActions}</div>
      </footer>
    </div>
  );
}
