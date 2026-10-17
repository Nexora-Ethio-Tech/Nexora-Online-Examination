import { useEffect, useState } from 'react';

export function ScheduleCountdown({
  sample,
  target,
  label,
}: {
  sample: { epoch: number; receivedAt: number };
  target: string;
  label: string;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const now = sample.epoch + Math.max(0, performance.now() - sample.receivedAt);
  const seconds = Math.max(0, Math.ceil((Date.parse(target) - now) / 1000));
  return (
    <p className="mt-2 text-sm text-muted-foreground">
      {seconds > 0
        ? `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s until ${label}`
        : `${label} time reached. Refresh for the latest availability.`}
    </p>
  );
}
