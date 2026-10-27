import { useEffect, useRef, useState } from "react";
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
  referencePanel,
  onReferenceToggle,
  scrollKey,
  children,
  className = "",
}) {
  const contentRef = useRef(null);
  const toggleButtonRef = useRef(null);
  const closeButtonRef = useRef(null);
  const hasOpenedRef = useRef(false);
  const [referencesOpen, setReferencesOpen] = useState(false);
  const [referencesLoaded, setReferencesLoaded] = useState(false);

  function toggleReferences() {
    const nextOpen = !referencesOpen;
    setReferencesOpen(nextOpen);
    if (nextOpen) setReferencesLoaded(true);
    onReferenceToggle?.(nextOpen);
  }

  useEffect(() => {
    if (!referencesOpen) return;
    function handleKeyDown(event) {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        setReferencesOpen(false);
        onReferenceToggle?.(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [referencesOpen, onReferenceToggle]);

  // Return keyboard focus to the toggle after closing the sidebar.
  useEffect(() => {
    if (referencesOpen) {
      hasOpenedRef.current = true;
      closeButtonRef.current?.focus();
    } else if (hasOpenedRef.current) {
      toggleButtonRef.current?.focus();
    }
  }, [referencesOpen]);

  // Start each newly selected requirement at the top of the scrolling area.
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;
  }, [scrollKey]);

  const progressPercent = progressMax > 0
    ? Math.min(100, Math.max(0, (progressValue / progressMax) * 100))
    : 0;

  return (
    <div className={`study-review-layout${referencesOpen ? " study-review-layout--references-open" : ""} ${className}`.trim()}>
      <div className="study-review-layout__main">
        <header className="study-review-layout__header">
          <div className="study-review-layout__heading">
            <div className="study-review-layout__heading-copy">
              <p className="study-review-layout__eyebrow">Requirements evaluation</p>
              <h1>{title}</h1>
              <p className="study-review-layout__description">{description}</p>
            </div>
            {timer && <div className="study-review-layout__timer">{timer}</div>}
            <div className="study-review-layout__heading-tools">
              <div className="study-review-layout__progress-summary">
                <strong>Requirement {requirementIndex} of {requirementCount}</strong>
                <span>{progressText}</span>
              </div>
              {referencePanel && !referencesOpen && (
                <button
                  ref={toggleButtonRef}
                  type="button"
                  className="study-review-layout__reference-toggle"
                  aria-expanded={false}
                  aria-controls="study-reference-sidebar"
                  onClick={toggleReferences}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="miter" aria-hidden="true" focusable="false">
                    <path d="M12 7.5 8.5 5H3v13h5.5l3.5 2 3.5-2H21V5h-5.5L12 7.5Z" />
                    <path d="M12 7.5V20" />
                  </svg>
                  <span>References</span>
                </button>
              )}
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

      {referencePanel && (
        <aside
          id="study-reference-sidebar"
          className="study-review-layout__sidebar"
          aria-label="Reference materials"
          hidden={!referencesOpen}
        >
          {referencesLoaded && (
            <>
              <div className="study-review-layout__sidebar-header">
                <strong>References</strong>
                <button ref={closeButtonRef} type="button" onClick={toggleReferences} aria-label="Close references">×</button>
              </div>
              <div className="study-review-layout__sidebar-content">{referencePanel}</div>
            </>
          )}
        </aside>
      )}
    </div>
  );
}
