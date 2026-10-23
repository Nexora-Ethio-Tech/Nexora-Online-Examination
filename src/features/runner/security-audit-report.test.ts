import { expect, it } from 'vitest';
import {
  summarizeSecurityEvents,
  formatSecurityAuditCSVDetailed,
  escapeCsvField,
} from './security-audit-report';
import { interruptionSchema } from './supervision';
import { incidentLabels, incidentBadgeClass } from './incident-badges';

const event = (kind: string, id = kind) => ({
  id,
  kind,
  observedAt: '2026-10-23T09:00:00Z',
  receivedAt: '2026-10-23T09:02:00Z',
  deviceGeneration: 1,
});
it('accounts for every supported event without treating returns as suspicious', () => {
  const events = interruptionSchema.shape.kind.options.map((kind) => event(kind));
  expect(summarizeSecurityEvents(events)).toEqual({
    total: 9,
    screenshots: 1,
    inspections: 1,
    blurs: 4,
    fullscreenExits: 1,
    tampering: 1,
    other: 1,
  });
  for (const kind of interruptionSchema.shape.kind.options) {
    expect(incidentLabels[kind]).toBeTruthy();
    expect(incidentLabels[kind]).not.toMatch(/intercepted|blocked|cheating/i);
    expect(incidentBadgeClass(kind)).toBeTruthy();
  }
  expect(incidentBadgeClass('devtools')).toContain('blue');
  expect(incidentLabels.screenshot_attempt).toContain('or inspection');
});
it('exports raw kinds, both timestamps and formula-safe identities', () => {
  const csv = formatSecurityAuditCSVDetailed(
    '=attempt',
    [event('devtools'), event('screenshot_attempt')],
    '+student',
  );
  expect(csv).toContain('ReceivedAt,DelaySeconds');
  expect(csv).toContain(
    "'+student,'=attempt,devtools,2026-10-23T09:00:00Z,2026-10-23T09:02:00Z,120,1",
  );
  expect(csv).toContain('screenshot_attempt');
  expect(escapeCsvField('"quoted, value"')).toBe('"""quoted, value"""');
});
