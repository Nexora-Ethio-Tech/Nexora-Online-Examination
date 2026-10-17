# Backend handoff: Group 2 design update

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
