import { useEffect, useRef, useState } from "react";
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

  return (
    <div
      className={`stage-timer${inGrace || expired ? " stage-timer--warning" : ""}`}
      role="status"
    >
      <div className="stage-timer__description">
        <strong>
          {expired
            ? "Review time ended"
            : inGrace
              ? "Additional time"
              : "Time remaining"}
        </strong>
        <span>
          {expired
            ? "Saving your work and moving to the next stage…"
            : inGrace
              ? "Please finish up. You'll move on automatically when this reaches zero."
              : `After this, you'll have ${graceMinutes} extra minute${graceMinutes === 1 ? "" : "s"} to finish.`}
        </span>
      </div>
      <span
        className="stage-timer__countdown"
        aria-label={`${seconds} seconds remaining`}
      >
        {formatTime(seconds)}
      </span>
    </div>
  );
}
