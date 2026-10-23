/**
 * Utility to generate formatted security audit reports for school proctor review
 */

export interface SecurityEventSummary {
  total: number;
  screenshots: number;
  blurs: number;
  fullscreenExits: number;
  inspections: number;
  tampering: number;
  other: number;
}

export interface SecurityEventItem {
  id: string;
  kind: string;
  observedAt: string;
  receivedAt?: string;
  deviceGeneration: number;
}

export function summarizeSecurityEvents(events: SecurityEventItem[]): SecurityEventSummary {
  const summary: SecurityEventSummary = {
    total: events.length,
    screenshots: 0,
    blurs: 0,
    fullscreenExits: 0,
    inspections: 0,
    tampering: 0,
    other: 0,
  };

  for (const ev of events) {
    if (ev.kind === 'screenshot_attempt') {
      summary.screenshots++;
    } else if (['window_blur', 'focus_lost', 'hidden', 'pagehide'].includes(ev.kind)) {
      summary.blurs++;
    } else if (ev.kind === 'fullscreen_exit') {
      summary.fullscreenExits++;
    } else if (ev.kind === 'devtools') {
      summary.inspections++;
    } else if (ev.kind === 'watermark_tamper') {
      summary.tampering++;
    } else {
      summary.other++;
    }
  }

  return summary;
}

/**
 * Escapes a value for CSV. Also neutralizes spreadsheet formula injection:
 * a field starting with = + - @ (or tab / CR) is prefixed with an apostrophe.
 */
export function escapeCsvField(value: string): string {
  let v = value ?? '';
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n\r]/.test(v)) v = `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function sortEventsChronologically(events: SecurityEventItem[]): SecurityEventItem[] {
  return [...events].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
}

export function formatSecurityAuditCSV(
  attemptId: string,
  events: SecurityEventItem[],
  studentLoginId = 'STUDENT',
): string {
  const headers = [
    'IncidentID',
    'StudentLogin',
    'AttemptID',
    'Kind',
    'ObservedAt',
    'DeviceGeneration',
  ];
  const rows = events.map((e) =>
    [e.id, studentLoginId, attemptId, e.kind, e.observedAt, String(e.deviceGeneration)].map(
      escapeCsvField,
    ),
  );

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/**
 * Detailed export for proctor review: adds ReceivedAt and DelaySeconds so
 * device/server time differences remain visible. Clock differences and network delays
 * can both affect this value; it is not evidence of deliberate blocking.
 */
export function formatSecurityAuditCSVDetailed(
  attemptId: string,
  events: SecurityEventItem[],
  studentLoginId = 'STUDENT',
): string {
  const headers = [
    'IncidentID',
    'StudentLogin',
    'AttemptID',
    'Kind',
    'ObservedAt',
    'ReceivedAt',
    'DelaySeconds',
    'DeviceGeneration',
  ];
  const rows = sortEventsChronologically(events).map((e) => {
    const observed = Date.parse(e.observedAt);
    const received = e.receivedAt ? Date.parse(e.receivedAt) : NaN;
    const delay =
      Number.isFinite(observed) && Number.isFinite(received)
        ? String(Math.round((received - observed) / 1000))
        : '';
    return [
      e.id,
      studentLoginId,
      attemptId,
      e.kind,
      e.observedAt,
      e.receivedAt ?? '',
      delay,
      String(e.deviceGeneration),
    ].map(escapeCsvField);
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

/** Events that reached the server long after they happened (default: more than 60 seconds). */
export function findDelayedEvents(
  events: SecurityEventItem[],
  thresholdMs = 60000,
): SecurityEventItem[] {
  return events.filter((e) => {
    if (!e.receivedAt) return false;
    const observed = Date.parse(e.observedAt);
    const received = Date.parse(e.receivedAt);
    return (
      Number.isFinite(observed) && Number.isFinite(received) && received - observed > thresholdMs
    );
  });
}
