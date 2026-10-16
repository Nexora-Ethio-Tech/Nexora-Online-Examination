# Authentication foundation delivery

13 October 2026. Frontend implementation against issued API contract v0.2. No new wire fields or backend endpoints were introduced by this slice.

Current-status note (15 October): this is a historical delivery record. Exam persistence and the later role workflows now exist; see master-plan-audit.md for current gaps. Operator-assisted production MFA enrollment/recovery was subsequently specified in BE-02 section 9. Its real-backend acceptance remains unverified.

## Implemented

- Login with generated user ID/password, validation and school-admin reset guidance.
- Administrator MFA challenge screen; no privileged UI until successful verification and authenticated /auth/me.
- Cookie/CSRF-aware typed fetch client, runtime response validation, normalized errors, cancellation/timeouts, Retry-After enforcement and no automatic mutation replay.
- Session restoration, role guards, role dashboard shells, logout and explicit session/network failures.
- Private query cache removal on identity change/logout/401, without blanket browser storage clearing. Exam IndexedDB persistence itself is not implemented yet.
- Isolated development mock transport, visible demo identification and build-time rejection of mock production builds. Demo sessions reset on page reload.

## Verification

Type checking, lint, formatting and 31 tests pass. Production build passes; dependency annotation warnings and the initial JS chunk size warning remain non-blocking. Tests cover role routing, MFA rejection/success, session restoration, anonymous/wrong-role access, failed logout, expiry, request/response validation, CSRF rotation, rate limits and timeout behavior.

Browser checks used synthetic identities: admin login stopped at MFA, verification opened the admin shell, student login opened the student shell, and logout returned to login. Login and student shell were inspected at 360px; no horizontal overflow was observed. Desktop login was inspected at 1280px. This is viewport testing, not a real Android or school-network test.

## Backend integration still required

Supply the real API URL and implement the five auth endpoints exactly as specified in api-contract.md. Verify actual cookie flags, session revocation, CSRF/Origin enforcement, school/role isolation and administrator MFA. Production MFA enrollment/recovery must follow the subsequently issued BE-02 section 9. Browser mocks and unit tests do not establish these server guarantees.

Run instructions and synthetic demo credentials are in README.md. No deployment or GitHub push is included in this delivery. Next frontend slice: assigned exams, preparation and exam runner.
