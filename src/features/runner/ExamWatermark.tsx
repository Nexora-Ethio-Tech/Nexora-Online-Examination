import { useEffect, useState } from 'react';
import { computeWatermarkOffset, formatWatermarkLabel } from './watermark-geometry';

export interface ExamWatermarkProps {
  studentLoginId?: string;
  examTitle?: string;
  attemptId?: string;
  schoolName?: string;
  /** 'high' (default) survives phone photos far better than the old 6% opacity. */
  intensity?: 'standard' | 'high';
}

// Literal class strings so Tailwind can see them.
const INTENSITY_CLASSES: Record<NonNullable<ExamWatermarkProps['intensity']>, string> = {
  standard: 'opacity-[0.06] dark:opacity-[0.10]',
  high: 'opacity-[0.12] dark:opacity-[0.16]',
};

export function ExamWatermark({
  studentLoginId = 'ANONYMOUS',
  examTitle = 'EXAM',
  attemptId = '',
  schoolName = 'NEXORA',
  intensity = 'high',
}: ExamWatermarkProps) {
  const [timeStr, setTimeStr] = useState(() => formatEATWatermarkTime(new Date()));
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(formatEATWatermarkTime(new Date()));
      setStep((s) => s + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const offset = computeWatermarkOffset(step);
  const watermarkText = formatWatermarkLabel(schoolName, studentLoginId, attemptId, timeStr);
  const shortId = [studentLoginId, attemptId ? attemptId.slice(-8) : '']
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      aria-hidden="true"
      data-testid="exam-watermark"
      // -inset-10 oversizes the layer so the jitter translate never exposes an unmarked edge.
      // z-[9000] keeps it above app dialogs but below the blackout overlay.
      className={`pointer-events-none fixed -inset-10 z-[9000] select-none overflow-hidden text-neutral-900 dark:text-white ${INTENSITY_CLASSES[intensity]}`}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: 'transform 1s ease-in-out',
      }}
    >
      <svg className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Pattern 1: full label (school, candidate, attempt, live timestamp) */}
          <pattern
            id="watermark-pattern"
            width="340"
            height="180"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-25)"
          >
            <text
              x="20"
              y="60"
              fill="currentColor"
              fontSize="13"
              fontWeight="bold"
              fontFamily="monospace"
              letterSpacing="0.05em"
            >
              {watermarkText}
            </text>
            <text
              x="80"
              y="140"
              fill="currentColor"
              fontSize="11"
              fontWeight="600"
              fontFamily="sans-serif"
              opacity="0.8"
            >
              NEXORA SECURE · {examTitle.slice(0, 24)}
            </text>
          </pattern>

          {/* Pattern 2: short candidate ID on a crossing angle, so any crop still identifies the student */}
          <pattern
            id="watermark-pattern-id"
            width="230"
            height="120"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(20)"
          >
            <text
              x="12"
              y="70"
              fill="currentColor"
              fontSize="11"
              fontWeight="bold"
              fontFamily="monospace"
              letterSpacing="0.05em"
            >
              {shortId}
            </text>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#watermark-pattern)" />
        <rect width="100%" height="100%" fill="url(#watermark-pattern-id)" />
      </svg>
    </div>
  );
}

function formatEATWatermarkTime(date: Date): string {
  // Format as EAT (UTC+3)
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const eatDate = new Date(utc + 3 * 3600000);
  const hours = eatDate.getHours();
  const minutes = String(eatDate.getMinutes()).padStart(2, '0');
  const day = String(eatDate.getDate()).padStart(2, '0');
  const month = String(eatDate.getMonth() + 1).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${day}/${month} ${h12}:${minutes} ${ampm} EAT`;
}
