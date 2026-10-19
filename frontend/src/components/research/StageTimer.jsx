import { useEffect, useId, useRef, useState } from "react";
import "./StageTimer.css";

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

// Timer gives durationMinutes to complete, then after that point they are given graceMinutes of grace period, then they are forced to continue
export default function StageTimer({
  startedAt,
  durationMinutes,
  graceMinutes = 0,
  onExpired,
}) {
  const [now, setNow] = useState(() => Date.now());
  const tooltipId = useId();
  const expiredOnce = useRef(false);
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  const startMs = new Date(startedAt).getTime();
  const mainMs = Math.max(0, durationMinutes * 60_000);
  const graceMs = Math.max(0, graceMinutes * 60_000);
  const elapsedMs = Math.max(0, now - startMs);
  const expired = elapsedMs >= mainMs + graceMs;
  const inGrace = elapsedMs >= mainMs && !expired;

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    expiredOnce.current = false;
  }, [startedAt, durationMinutes, graceMinutes]);

  useEffect(() => {
    if (expired && !expiredOnce.current) {
      expiredOnce.current = true;
      onExpiredRef.current?.();
    }
  }, [expired]);

  if (!Number.isFinite(startMs) || !Number.isFinite(mainMs)) return null;

  const remainingMs = expired
    ? 0
    : inGrace
      ? mainMs + graceMs - elapsedMs
      : mainMs - elapsedMs;
  const seconds = Math.ceil(remainingMs / 1000);

  const tooltipTitle = expired
    ? "Review time ended"
    : inGrace
      ? "Additional time"
      : "Time remaining";
  const tooltipMessage = expired
    ? "Saving your work and moving to the next stage…"
    : inGrace
      ? "You're in the grace period. Please finish up. You'll move on automatically when this countdown reaches zero."
      : graceMinutes > 0
        ? `When this countdown reaches zero, you'll have ${graceMinutes} additional minute${graceMinutes === 1 ? "" : "s"} to finish before moving on automatically.`
        : "You'll move on automatically when this countdown reaches zero.";

  return (
    <div
      className={`stage-timer${inGrace || expired ? " stage-timer--warning" : ""}`}
      role="status"
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      <svg
        className="stage-timer__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <span
        className="stage-timer__countdown"
        aria-label={`${seconds} seconds remaining`}
      >
        {formatTime(seconds)}
      </span>
      <span className="stage-timer__tooltip" id={tooltipId} role="tooltip">
        <strong>{tooltipTitle}</strong>
        <span>{tooltipMessage}</span>
      </span>
    </div>
  );
}
