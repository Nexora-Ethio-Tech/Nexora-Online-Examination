# Backend handoff

## Backend integration in progress — 17 October 2026

The owner selected the existing frontend contracts as the implementation target, before the older handover guide's proposed essay or short-answer extensions. Work is on `feat/backend-frontend-integration`; this is not a completed backend acceptance report.

With explicit authorization, migrations 009 (browser supervision), 010 (readiness and device-transfer history), and 011 (directory revisions and roster previews) were applied to the configured Supabase database. This supersedes the historical statement below that migration 009 is still unapplied. No production frontend or backend deployment was performed during this work.

Implemented source includes live monitor reads, readiness reporting and audited device replacement, plus school directory routes, roster preview/commit and one-time credential issuance. All six expanded operational tests passed against real Supabase, including the directory increment; see [integration testing](backend-integration-testing.md) for the current evidence boundary.

The AI provider choice is OpenAI-compatible with a custom base URL. The backend adapter accepts `OPENAI_API_KEY`, `OPENAI_BASE_URL` and `OPENAI_MODEL`; details and remaining provider acceptance are in [AI configuration](../nexora-backend/docs/ai-provider-configuration.md). Provider unit tests do not establish a working import worker or real-model quality.

Remaining backend work includes full authoring/import workers, approval/scheduling/accommodations, results/publication, practice, recovery case reads, end-to-end frontend verification and hosted API routing. Existing source for delivery/authentication also needs acceptance across those combined flows. Do not describe the backend as finished based on these increments.

## UI simplification — 16 October 2026

The follow-up on feat/quiet-sharp-ui sharpens corners, removes decorative surfaces and redundant copy, and simplifies status styling. No API, timing, permissions, persistence or backend changes. See the updated [design testing guide](sage-mint-design-testing.md).

## Sage and mint design — 16 October 2026

The visual update on feat/sage-mint-design changes shared styling, exam grouping, card layouts, charts and the default question navigator display. It adds no API contract or backend requirements. The earlier browser-supervision migration and real integration acceptance below remain outstanding. See [sage-mint-design-testing.md](sage-mint-design-testing.md) for the UI checks. Existing server data remains authoritative; no screenshot sample statistics are used.

## Browser controls — 16 October 2026

New additive endpoints and migration are issued in [backend-browser-controls-task.md](backend-browser-controls-task.md). The matching frontend and backend source are implemented on feat/browser-exam-controls. Apply migration 009 and complete the required real API tests before deployment; no hosted migration or integration acceptance is claimed. Send this document together with [browser-controls-testing.md](browser-controls-testing.md) to the backend developer.

The older design-only note below applies only to its original scope.

## Group 2 design update

Date: 16 October 2026. Scope: approved frontend design changes on `feat/workspace-design`, based on the backend-integrated main branch at `e422248`.

No API contract revision or new backend endpoint is issued by this update. Existing issued backend requirements remain mandatory; historical copies are retained under `nexora-backend/docs/`, including `Nexora_Backend_BE11_v0.12/docs`. This note does not assert that the merged backend has passed frontend integration acceptance.

## Required behavior to preserve during integration

- Teacher Save and next uses the existing revision-bound item-save call. A failed validation or revision conflict must not be reported as saved. Submission still requires all reviews and the existing backend validation; the new final confirmation adds no request fields.
- Student review marks are optional local IndexedDB metadata (`reviewItemIds`), scoped to school, user, attempt, exam version, schedule revision and device generation. They are excluded from answer requests, frozen answer payloads and receipt digests. Do not add them to grading or require the backend to persist them.
- Only the existing matching committed receipt permits the Submitted successfully state. Pending uploads and recovery cases are not accepted submissions.
- Refresh feedback and countdowns do not authorize access. Continue returning server time and enforcing scheduling, release, tenant and role gates. All schedule displays remain EAT.
- Charts consume existing official analytics fields without recalculating marks or changing publication gates.
- School forms retain the same mutation bodies, audit reasons, revisions, idempotency handling and memory-only credential delivery.
- The focused exam layout removes the workspace/account controls from the attempt page. Existing leave/reload guards, deadlines, local evidence retention and server revalidation remain required.

## Report back during real integration testing

Test the existing teacher save/submit flow, scheduled preparation/unlock, offline answer retry and receipt recovery, result publication/analytics, and school creation/credential flows against the real API. Report the endpoint, request ID, expected response, actual response and reproducible steps for any mismatch. No backend changes are needed merely to support the new layout.

See [the frontend testing guide](group-2-design-testing.md) for the revised controls and expected states.
