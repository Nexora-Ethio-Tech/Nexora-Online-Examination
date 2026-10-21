import { formatEatDateTime } from '@/lib/ethiopian-date';
import type { Interruption } from '@/features/runner/supervision';

const labels: Record<Interruption['kind'], string> = {
  hidden: 'Exam tab hidden',
  returned: 'Exam tab visible again',
  pagehide: 'Exam page left',
  fullscreen_exit: 'Full screen exited',
  focus_lost: 'Exam window became inactive',
};
export function InterruptionRecord({ event }: { event: Interruption & { receivedAt: string } }) {
  return (
    <li className="space-y-1 border-b py-3 text-sm">
      <p className="font-medium">{labels[event.kind]}</p>
      <p>Device-reported time: {formatEatDateTime(event.observedAt, true)}</p>
      <p>School received report: {formatEatDateTime(event.receivedAt, true)}</p>
      <p className="text-muted-foreground">Browser approval version: {event.deviceGeneration}</p>
    </li>
  );
}
