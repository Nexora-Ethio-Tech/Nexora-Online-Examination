import { formatEatDateTime } from '@/lib/ethiopian-date';
import type { Interruption } from '@/features/runner/supervision';

import { incidentLabels, incidentBadgeClass } from '@/features/runner/incident-badges';
export function InterruptionRecord({ event }: { event: Interruption & { receivedAt: string } }) {
  return (
    <li className="space-y-1 border-b py-3 text-sm">
      <p>
        <span
          className={`inline-block rounded px-2 py-1 font-medium ${incidentBadgeClass(event.kind)}`}
        >
          {incidentLabels[event.kind]}
        </span>
      </p>
      {event.reason && <p>{event.reason}</p>}
      <p>Device-reported time: {formatEatDateTime(event.observedAt, true)}</p>
      <p>School received report: {formatEatDateTime(event.receivedAt, true)}</p>
      <p className="text-muted-foreground">Browser approval version: {event.deviceGeneration}</p>
    </li>
  );
}
