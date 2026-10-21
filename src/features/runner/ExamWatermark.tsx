import { formatEatDateTime } from '@/lib/ethiopian-date';
import { useEffect, useId, useState } from 'react';

export function ExamWatermark({ attemptId }: { attemptId: string }) {
  const patternId = useId().replaceAll(':', '');
  const [timestamp, setTimestamp] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => setTimestamp(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const label = `Nexora · ${attemptId} · ${formatEatDateTime(timestamp)}`;
  return (
    <>
      <p className="break-all text-xs text-muted-foreground" aria-label="Exam watermark">
        {label}
      </p>
      <svg
        className="exam-watermark-tiles"
        aria-hidden="true"
        focusable="false"
        width="100%"
        height="100%"
      >
        <defs>
          <pattern id={patternId} width="360" height="150" patternUnits="userSpaceOnUse">
            <g transform="translate(12 75) rotate(-12)" fill="currentColor" fontSize="10">
              <text>Nexora · {attemptId}</text>
              <text y="18">{formatEatDateTime(timestamp)}</text>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${patternId})`} />
      </svg>
    </>
  );
}
