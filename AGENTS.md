# Nexora frontend instructions

Contract v0.12 adds BE-11 readiness reporting. Read docs/backend-readiness-task.md and exams/readiness.ts. Report only after checksum, completed local write and verified production shell. Never report the development bypass. readyCount is a subset of preparing; preserve identity-bound replay and invalidate on device/version changes. Readiness is not an unlock prerequisite or online-status proof.

Contract v0.11 adds BE-10 extra-time accommodations. Read docs/backend-accommodations-task.md and the executable admin/accommodation-schemas.ts and api.ts. BE-04 sessionSchema now requires latestDeadlineAt; history adds accommodation_changed. Preserve frozen membership and allowances on reschedule, reject new changes at preparation/delivery, and replay committed identical requests after cutoff. Publication/practice use the entire roster deadline including absent students. F-06 readiness is separate.

## Authority

Follow current user instructions, then Final MVP Implementation Documentation v3.0 (12 October 2026), then aligned repository contracts. The user explicitly superseded the older plan on 13 October. Conflicting older instructions are invalid.

This repository owns the frontend; a separate developer owns the backend. Read docs/api-contract.md, docs/backend-student-exam-task.md and docs/exam-engine.md before feature work. Contract v0.5 adds BE-04 admin approval/scheduling; BE-03 teacher preparation and v0.3 student/auth payloads are unchanged. Read docs/backend-teacher-exam-task.md for authoring and docs/backend-admin-exam-task.md for approval/scheduling. These contracts are issued by the project owner, not subject to backend approval. The project owner supplies missing interface details and decides revisions; the backend reports progress and concrete blockers. Never describe requirements or mocks as implemented behavior. Record issued changes through docs/backend-handoff.md.

## Implementation

Contract v0.10 adds BE-09 live sitting monitoring and device replacement. Read docs/backend-monitor-task.md; exact DTOs/calls are src/features/exams/monitor/schemas.ts and api.ts. Transfer now requires expectedDeviceGeneration and returns an audited transfer identity/time plus unchanged deadline. Admin reads never update student contact or create submission. Preserve frozen roster counts, server-only sequence-zero answer inheritance, old-generation evidence and atomic transfer/replay. Use 15-second visible monitor refresh, truthful stale/last-contact labels and no connectivity-based penalties. The synthetic rehearsal is development-only; real cookies, multiple devices and database races remain backend acceptance work.

Contract v0.9 adds BE-08 school setup/accounts. Read docs/backend-school-task.md; executable DTOs/calls are src/features/school/schemas.ts and api.ts. Preserve tenant/role/MFA scope, assignment ownership and frozen rosters. Credential responses stay in component memory only, never query/mutation caches or browser storage. Successful credential replay returns identities/metadata with credentials null; lost responses require an explicit reset, never automatic regeneration. Production passwords use salted Argon2id; the demo digest is not production security. Directory and exam demo limitations are documented in docs/school-setup.md.

Contract v0.8 adds BE-07 practice. Read docs/backend-practice-task.md; executable DTOs are src/features/practice/schemas.ts. Enforce admin/time/publication/all-related-sitting gates, first-answer immutability, valid completed maximum scoring and separation from official marks. GET /me/results has additive practice metadata. BE-04 must prevent scheduling while practice is enabled and official reuse after release. Demo tests do not prove backend concurrency or isolation.

Contract v0.7 adds BE-06 recovery review. Read docs/backend-recovery-task.md for case reads/decisions. Preserve immutable evidence and correlate accepted receipts to the recovery upload key; acceptance never automatically publishes a result. Demo-only example routes are not production contracts.

Contract v0.6 additionally issues BE-05 official results/publication. Read docs/backend-results-task.md for results work; src/features/results/schemas.ts is the executable DTO source. Preserve immutable publication revisions and server-side release/assignment gates. Earlier v0.5, v0.4 and v0.3 interfaces remain unchanged.

- Reuse React, TypeScript, Vite, Tailwind and existing shadcn/shared components. Preserve the cn alias. Do not regenerate the UI kit or upgrade for novelty.
- Use npm and package-lock.json; npm ci for reproducible installs. Node 24 is the current local baseline; host compatibility remains to be verified. Record actual versions in docs/VERSIONS.md after dependency changes.
- React Router, TanStack Query, React Hook Form/Zod and idb are installed. Add dependencies only when an authorized implementation slice needs them.
- Use one typed fetch client, TanStack Query for server state, a small auth context, a pure exam reducer and transactional IndexedDB storage. Keep network calls out of UI components. Derive shared types from one schema source when implementation starts; do not hand-maintain duplicate DTOs.
- Feature folders: auth, school, exams, runner, results, practice. Keep routing/providers in src/app and infrastructure in src/lib.
- Preserve strict TypeScript: no any, suppression comments or casts merely to silence errors. Use accessible existing controls and loading/empty/error/success states.

## Product integrity

- New backend authentication uses opaque HttpOnly cookie sessions, Origin checks and CSRF. No JWT refresh flow is assumed. Never persist credentials in browser storage.
- Server session determines school and permissions. Teachers submit; admins approve, schedule, publish, enable practice and decide recovery. Frontend guards are usability aids only.
- Students use generated IDs/passwords without required email. Admin MFA precedes privileged access and live school data.
- Store UTC; display exam schedules explicitly in Africa/Addis_Ababa (EAT), independent of browser timezone. Preparation lasts ten minutes. Late joining never resets a deadline.
- Official packages exclude answer keys and explanations. Decryption keys remain server-side until authorized common-start unlock.
- Persist each answer and outbox entry atomically before showing device-save success. Show last server save and pending upload separately.
- Submitted requires a committed receipt for the exact frozen snapshot. Preserve pending evidence across 401, reload, retries and updates. Recovery pending is not submitted.
- Student screens support 360px. Open-tab offline continuation follows unlock; reload requires online revalidation before editing. Never force service-worker updates during pending work.
- Practice results never alter official marks. Approved explanations are released only through authorized practice. Never auto-penalize focus events or claim browser exams are cheat-proof.

## Verification and delivery

- Mocks support development only. Acceptance uses the real API/database; production disables mocks. The current placeholder e2e script is not an E2E test.
- Run npm run check and npm run build for implementation changes. For documentation, format changed files and run the existing check suite. Never weaken tests or edit node_modules/cache to bypass failures.
- Add meaningful integrity, timing, persistence and recovery tests as features are implemented. Real phone/network checks remain separate evidence.
- Work on a task branch; preserve unrelated work. No force pushes or secrets in commits.
- The user authorizes automatic commits after each completed, meaningful project change once its required checks pass. Keep commits focused on finished work and report the commit hash. This standing authorization covers commits; pushing and merging still require a user request.
- Report changed files, actual checks and blockers honestly. A functional demonstration does not establish 500-student capacity.
