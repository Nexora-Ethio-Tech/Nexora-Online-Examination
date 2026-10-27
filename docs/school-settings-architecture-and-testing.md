# School settings corrections

School setup → Settings replaces the AI settings label. It contains school name editing and the existing AI exam generation on/off control. The header displays the authenticated school name prominently, with Nexora as the product label. A successful rename refreshes the authenticated session and school queries; errors retain the typed name and allow an explicit refresh. Onboarding introduces these controls. Additional settings can be added here as their workflows are implemented.

School name DTOs come from the shared executable school-profile schema. GET/PATCH `/school/settings` are restricted to school administrators; names persist in the existing schools table. PATCH uses an expected name, school-row lock, actor-scoped idempotency and an audit event. Slugs and stable school/account identities are unchanged. Existing session reads retrieve the current database name. Other open sessions see the new name on their next session refresh.

Verify a blank name cannot save, a valid rename updates the header and remains after reload, stale expected names fail without overwriting, and an identical retry returns its committed response. Teacher/student direct writes must fail. Check another school's name stays unchanged. AI off/on must retain its existing generation admission and worker policy checks. Assignment and revocation require confirmation but no reason before or after exam start; stale revisions still fail and audit events remain.

Automated UI journeys use the development simulator. Backend unit checks and builds do not establish real database acceptance. Production deployment and real API/database verification remain separate.
