import { formatEatDateTime } from '@/lib/ethiopian-date';
import { useEffect, useState } from 'react';

export function ExamWatermark({ attemptId }: { attemptId: string }) {
  const [timestamp, setTimestamp] = useState(() => new Date().toISOString());
  useEffect(() => {
    const timer = window.setInterval(() => setTimestamp(new Date().toISOString()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const label = `Nexora · ${attemptId} · ${formatEatDateTime(timestamp)}`;
  return (
    <div
      className="pointer-events-none select-none space-y-2 break-all text-xs text-muted-foreground"
      aria-label="Exam watermark"
    >
      <p>{label}</p>
      <p aria-hidden="true" className="text-right">
        {label}
      </p>
    </div>
  );
}
