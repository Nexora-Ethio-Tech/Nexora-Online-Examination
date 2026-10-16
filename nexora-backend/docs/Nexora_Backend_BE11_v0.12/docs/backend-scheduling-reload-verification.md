# Backend verification: scheduling and reload recovery

15 October 2026. Mandatory verification of existing BE-02/BE-04 requirements under API contract v0.10. This is not a new endpoint addendum and does not authorize schema changes. Send this file with [the frontend testing guide](scheduling-reload-testing.md).

## What the frontend now does

- Shows an EAT clock derived from serverNow and monotonic elapsed time; refreshes existing admin exam detail when explicitly requested. Locally pauses confirmation after a 60-second-old sample. This UI freshness threshold is not a new server timing allowance.
- Gives separate preparation/results errors and blocks rescheduling at the original preparation boundary.
- Shows private-free cold-reload recovery guidance until authentication succeeds, then returns the same school/student to its retained attempt path. The navigation hint grants no server access and contains no credentials, keys or answers.
- Keeps existing runner reconciliation, immutable final retries and receipt verification unchanged.

## Required backend behavior and tests

1. `GET /admin/exams/:id` must return accurate UTC serverNow on each authorized response. Do not cache/replay an old clock for ordinary GET refreshes. Return current revisions, package/schedule state and canReschedule. Use existing private/no-store and school/admin/MFA restrictions.
2. Session creation must reject preparation at or before server time, calculate common start plus ten minutes and common end from approved duration, and validate planned results against every approved accommodation deadline. Planned date alone never releases results. Enforce all BE-04 approval/roster/package rules in the transaction.
3. Rescheduling must check server time against the OLD preparation boundary, schedule revision and attempt/package issuance. Concurrent preparation versus reschedule must have one valid outcome. A stale browser or changed client clock must not extend an active sitting. Preserve existing idempotent replay semantics: an already committed identical mutation is replayed according to BE-04 even after the boundary; it is not a new schedule edit.
4. `GET /auth/me` must correctly distinguish expired/anonymous (401) from transient service failure. Login must restore only the authenticated identity. The browser's retained attempt path/user identifiers are untrusted navigation data, never authorization inputs. Test cross-school and cross-student attempt access after a different login.
5. `GET /attempts/:id`, device enrollment/binding and unlock must enforce existing ownership, generation, server clock and state. Preserve deadline, versions and canonical question/option order. Online reload cannot create a fresh duration or silently transfer the device.
6. Expired authentication or a lost final response must not invalidate a committed receipt. Verify same exact frozen body/key returns the same receipt after reauthentication and deadline, subject to existing ownership/replay exceptions. If no receipt exists, reconcile actual state and enforce late recovery rather than fabricate submission from interim saves.
7. Sensitive API responses remain private/no-store. Shell caching must not cache authentication, answer, key, result or feedback responses. Provide the real frontend origin/cookie configuration needed for the deployed production browser test.

## Required report

Return the API commit/schema revision, staging base URL and exact allowed frontend origin; supply synthetic account/MFA instructions privately. Include actual test commands/results and database evidence for valid creation, past-date rejection, accommodated result boundary, stale reschedule rejection, reschedule/preparation race, expired-session restore, wrong-user refusal, device replacement, lost-response receipt replay and late recovery. Identify each failed/unimplemented case explicitly.

Run the companion guide against the real frontend/API and report the tested frontend build, browser/device and whether offline reload used an already prepared production shell. A synthetic API, seeded text or frontend unit test is not backend acceptance evidence. Continue BE-02 through BE-09 work; accommodation-configuration and preparation-readiness contracts remain separate pending tasks F-05/F-06. Do not invent new payloads for them.

## Message to accompany these files

Implement and verify the existing scheduling and recovery rules listed in this note. No new API is requested. Use the testing guide to run the integrated browser cases and return the mandatory evidence above. Report concrete blockers and continue unaffected work; this is not a request to choose or approve alternative product rules.
