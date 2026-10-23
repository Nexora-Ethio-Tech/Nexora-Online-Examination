# Factual activity reporting — architecture and testing

## Changes

The four expandable history groups remain: window/tab changes, screen protection, watermark integrity, and returns. Individual records have labeled color badges: red for the existing capture/inspection event, blue for new inspection/print actions, orange for focus/page changes, purple for fullscreen exits, fuchsia for watermark integrity, and neutral for returns. Colors distinguish categories, not guilt or severity.

Advanced incident analysis keeps filters, counts, and retained records. Weighted scores, risk tiers, warning recommendations and severity ordering were removed. Attempts are ordered by latest received report. Dismissed records remain visible; no server penalties or disqualification action were added.

## Integration

Our files live in `src/features/runner/` and `src/features/exams/monitor/`; the backend is the nested `nexora-backend/` in this repository. Do not copy the other project's replacement files over these versions.

The additive event kind `devtools` is accepted by both interruption schemas. The existing hook emits it for its inspection branch (which also handles print, save, source, and context-menu actions). The label therefore says “Inspection or print action reported,” not “Developer tools opened/blocked.” It passes through the existing engine queue, device generation, replay protection, and tenant authorization. Blackout strictness, cooldown, five-episode UI lock, saved answers and exam deadlines are unchanged.

Existing `screenshot_attempt` records remain unchanged and labeled “Capture or inspection shortcut reported”: older records combine these actions and cannot be retrospectively separated reliably. `watermark_tamper`, `focus_lost`, reason text and all other accepted kinds remain supported. Browser reports do not verify OS capture, intent, or misconduct.

Deploy the backend acceptance change before the frontend emitter. No database migration is needed for this additive validated string event. Previously pending migrations, including 027, still need isolated database validation before deployment.

“Export displayed activity (CSV)” exports the currently loaded history (up to 100 records), not a complete lifetime audit. It includes raw kinds, observed/received UTC timestamps, the difference in seconds, device generation, attempt reference and student login. Formula-leading fields are escaped. Onscreen timestamps remain EAT. Clock differences and network delays can both affect timestamp differences; delayed delivery is not evidence of deliberate blocking.

## Testing order

1. Run `npm run check` and `npm run build` in `exam-frontend`. In its `nexora-backend`, run `npm run build` and `npm run test:unit`.
2. Use isolated local test accounts. In a student exam, press F12: the shield should still hide the exam, while the received event kind is now `devtools`. PrintScreen remains `screenshot_attempt`. These checks verify browser reactions, not guaranteed capture prevention.
3. Trigger both during the same blackout episode: distinct event kinds are reported once each, while the episode count remains one. Verify the existing resume delay and five-episode lock still work.
4. Repeat while offline; reconnect and verify queued inspection evidence arrives without duplicate records, answer changes, or a changed deadline.
5. In Live exams, open a student's device/history view. Confirm four expandable groups, visible text badges and distinct event colors. New inspection reports belong to Screen protection. Historical capture/inspection records retain their label.
6. Expand Advanced incident analysis. Confirm no risk score or warning/disqualification recommendation. Verify latest received ordering, search, category filters and delayed-delivery filter. Check dismissed evidence remains available when its filter includes it.
7. Export displayed activity. Verify raw kinds and both timestamps. Confirm it contains only the displayed window of received history and CSV fields cannot become spreadsheet formulas.
8. Test desktop, 360px mobile, and landscape with keyboard navigation. Colors must not be the only way to identify an event. Verify EAT times, original reasons and device generation remain visible.
9. Real backend acceptance: check anonymous/wrong-school/wrong-device requests are rejected; replaying the same event ID is deduplicated and changing its kind conflicts. Existing unit tests cover the service logic, but real database acceptance remains separate.

## Verification

See the final chat report for automated results. Synthetic browser tests do not establish real OS capture blocking or database concurrency. No production database, deployment, or push is part of this task.

Validation on 23 October 2026: frontend typecheck, lint, formatting, 270 tests and 14 tooling checks passed; frontend/backend builds passed; all 206 backend unit tests passed. All three targeted Playwright monitor journeys passed at desktop, mobile and landscape sizes, including the expanded panel's accessibility audit. Existing build chunk-size/dependency-annotation warnings remain. Real database integration and manual Windows capture-tool checks were not run for this reporting-only change. Earlier isolated PostgreSQL/migration blockers remain unresolved.
