/**
 * Utility to generate formatted security audit reports for school proctor review
 */

export interface SecurityEventSummary {
  total: number;
  screenshots: number;
  blurs: number;
  fullscreenExits: number;
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
    other: 0,
  };

  for (const ev of events) {
    if (ev.kind === 'screenshot_attempt') {
      summary.screenshots++;
    } else if (ev.kind === 'window_blur') {
      summary.blurs++;
    } else if (ev.kind === 'fullscreen_exit') {
      summary.fullscreenExits++;
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
 * late-delivered events (a sign telemetry was blocked or the device went offline) stand out.
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

export type RiskLevel = 'clear' | 'review' | 'high';

export interface RiskAssessment {
  level: RiskLevel;
  score: number;
  reasons: string[];
}

export interface RiskThresholds {
  reviewAt?: number;
  highAt?: number;
}

/**
 * Simple weighted score to help proctors triage attempts.
 * Screenshots weigh most; tamper and other events count as 2; blurs as 1.
 */
export function assessAttemptRisk(
  summary: SecurityEventSummary,
  { reviewAt = 4, highAt = 10 }: RiskThresholds = {},
): RiskAssessment {
  const score =
    summary.screenshots * 3 + summary.fullscreenExits * 2 + summary.other * 2 + summary.blurs * 1;

  const reasons: string[] = [];
  if (summary.screenshots > 0) reasons.push(`${summary.screenshots} screenshot attempt(s)`);
  if (summary.fullscreenExits > 0) reasons.push(`${summary.fullscreenExits} fullscreen exit(s)`);
  if (summary.other > 0) reasons.push(`${summary.other} other security event(s) (e.g. tampering)`);
  if (summary.blurs > 0) reasons.push(`${summary.blurs} window focus loss(es)`);

  const level: RiskLevel = score >= highAt ? 'high' : score >= reviewAt ? 'review' : 'clear';
  return { level, score, reasons };
}
