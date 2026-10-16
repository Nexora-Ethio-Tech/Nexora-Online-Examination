# Nexora School Exam Platform — Master Backend Handover & Architecture Guide

**Document Status:** Complete Implementation & Handover Specification  
**Current Date:** October 16, 2026  
**Reference Directives:** Master Plan v3.0, API Contract v0.2/v0.3, BE-02A, BE-02B, BE-02C, BE-03, BE-04, BE-05  
**Target Database:** PostgreSQL 15+ (Remote Supabase Session Pooler `aws-0-eu-west-1.pooler.supabase.com:5432`)  
**Target Timezone:** `Africa/Addis_Ababa` (EAT, UTC+3) — Stored internally in UTC (`timestamptz`), ISO 8601 strings externally.

---

## 1. Technology Stack

| Layer | Technology | Version | Purpose / Architecture Rationale |
|---|---|---|---|
| **Runtime & Language** | **Node.js** (v20+) + **TypeScript** | 5.7.3 | Strict type safety, decorators, and clean modular domain architecture. |
| **Framework** | **NestJS** | 10.4.15 | Dependency injection, modular boundary encapsulation, interceptors, guards, and custom filters. |
| **Execution Tooling** | **tsx** | 4.19.2 | High-speed zero-config TypeScript execution for scripts and migrations. |
| **Database & Pooling** | **PostgreSQL** + **pg** (`node-postgres`) | 8.13.1 | Real ACID transactions with row locking (`FOR UPDATE` / `FOR SHARE`) and connection pool management. |
| **Tenant Isolation** | **PostgreSQL Row-Level Security (RLS)** | Native | `FORCE ROW LEVEL SECURITY` on all tenant-scoped tables with session context `app.current_school_id`. |
| **Cloud Database Host** | **Supabase** (EU West Ireland) | Cloud | Live PostgreSQL database with Session Pooler on port `5432`. |
| **Password Security** | **Argon2id** (`argon2`) | 0.41.1 | State-of-the-art password hashing conforming to OWASP guidelines. |
| **Admin 2FA / MFA** | **otplib** | 12.0.1 | RFC 6238 Time-based One-Time Password (TOTP) generation and verification (30s window, HMAC-SHA1). |
| **Package Encryption** | **Node.js Crypto** (`aes-256-gcm`) | Native | Student exam package payload encryption using AES-256-GCM with unpadded Base64URL encoding. |
| **Canonical Digest** | **Node.js Crypto** (`sha256`) | Native | RFC-compliant compact UTF-8 JSON tuple serialization and SHA-256 digest calculation (`nexora-final-v1`). |
| **Request Parsing** | **cookie-parser** | 1.4.7 | HttpOnly cookie session management (`nexora_session`, `nexora_device_cred`). |
| **Testing Framework** | **Vitest** + **Supertest** | 3.0.4 / 7.0.0 | High-performance E2E testing against the live PostgreSQL database with mockable clock boundaries. |

---

## 2. Database Migrations & Multi-Tenancy Architecture

All four master migrations are fully written and applied to the Supabase instance:

### Migration 001: Tenants, Auth & Row-Level Security (`001_tenants_auth_and_rls.sql`)
- Creates `schools` (tenants), `users` (students, teachers, admins), `auth_sessions`, `device_bindings`, and `audit_events`.
- Enforces `FORCE ROW LEVEL SECURITY` across tenant tables.
- Implements PostgreSQL security policies:
  ```sql
  CREATE POLICY tenant_isolation_policy ON <table>
    FOR ALL
    USING (
      current_setting('app.is_migration_or_admin', true) = 'true'
      OR school_id::text = current_setting('app.current_school_id', true)
    );
  ```
- Uses `set_config('app.current_school_id', $1, true)` inside NestJS transactions to bind every query to the verified tenant.

### Migration 002: Directory & Content (`002_directory_and_content.sql`)
- Creates academic calendar structures: `academic_years`, `terms`, `grade_levels`, `sections`, `subjects`, `enrollments`.
- Content authoring: `exam_papers`, `exam_versions`, `exam_items`, `rubrics`.

### Migration 003: Sessions & Exam Delivery (`003_sessions_and_delivery.sql`)
- Creates `exam_sessions`, `session_roster` (accommodations, extra time, admission status).
- Creates `exam_packages` (AES-256-GCM encrypted bundles and encrypted release keys).
- Creates delivery tracking: `attempts`, `attempt_answers`, `submissions`, `idempotency_keys`.

### Migration 004: Results, Practice & Jobs (`004_results_practice_jobs.sql`)
- Creates `recovery_uploads` (for late disconnected submissions), `official_results`, `practice_sessions`, `practice_answers`, `background_jobs`.

---

## 3. What Was Completed & Verified

### A. Foundations & Core Services
1. **`DbService` (`src/common/db/db.service.ts`)**:
   - Manages connection pool to Supabase.
   - Provides `withTenantTransaction(schoolId, async (client) => { ... })` ensuring `set_config('app.current_school_id', schoolId, true)` is executed in the transaction before running any application queries.
2. **`ClockService` (`src/common/clock/clock.service.ts`)**:
   - Deterministic clock service. In development and testing, supports `setMockTime()` and `advanceByMs()` to test exact preparation windows, start boundaries, and deadline expirations without system sleep.
3. **`GlobalExceptionFilter` (`src/common/filters/global-exception.filter.ts`)**:
   - Traps all HTTP and domain exceptions, rendering the exact contract error envelope:
     ```json
     {
       "code": "VALIDATION_ERROR",
       "message": "...",
       "details": [ { "path": "answers", "message": "..." } ],
       "requestId": "uuid",
       "context": { ... }
     }
     ```
4. **Canonical Submission Digest (`src/common/crypto/canonical-digest.ts`)**:
   - Verifies byte-for-byte against the test fixture `student-exam-v1.json`.
   - Produces canonical JSON tuple:
     `["nexora-final-v1", attemptId, examVersion, scheduleRevision, deviceGeneration, finalSeq, sortedAnswers]`
   - ASCII byte-sorted items, unpadded compact JSON, SHA-256 lowercase hex.
5. **Package Encryption Cipher (`src/common/crypto/package-cipher.ts`)**:
   - AES-256-GCM package encryption and decryption with unpadded Base64URL IVs and ciphertexts.

---

### B. BE-02A: Authentication, Sittings & Exam Preparation (11/11 Tests Passing)
- **`GET /api/v1/health` & `GET /api/v1/ready`**: Production health checks and database pool warming.
- **`GET /api/v1/auth/csrf`**: Issues session-bound CSRF token in header and anonymous cookie.
- **`POST /api/v1/auth/login`**: Authenticates credentials via Argon2id. Students/teachers receive immediate authenticated session; school admins receive MFA challenge status (`mfa_required`).
- **`POST /api/v1/auth/mfa/verify`**: Validates RFC 6238 TOTP 6-digit code against decrypted user MFA secret and promotes session.
- **`GET /api/v1/auth/me`**: Returns authenticated user profile, school details, and fresh CSRF token.
- **`POST /api/v1/auth/device`**: Enrolls student device ID and issues HttpOnly credential cookie `nexora_device_cred`.
- **`POST /api/v1/auth/logout`**: Revokes session in database and clears session cookies.
- **`GET /api/v1/me/exams`**: Lists admitted, scheduled, preparing, and active exam sittings for the logged-in student.
- **`POST /api/v1/sessions/:sessionId/attempts`**:
  - Gated by `preparationVisibleAt` (returns 409 `NOT_PREPARING` if called early).
  - Validates student device enrollment.
  - Generates randomized `questionOrder` and `optionOrders` per student.
  - Inserts attempt row in state `preparing`.
- **`GET /api/v1/attempts/:attemptId/package`**: Returns encrypted package ciphertext without the decryption key.
- **`POST /api/v1/attempts/:attemptId/unlock`**:
  - Gated by `startsAt` (returns 409 `NOT_STARTED` with `retryAt` if called before exam start).
  - Releases AES-256-GCM exam key, unlocks attempt into `active` state.
- **Multi-Tenant Isolation**: Verified that students from School 2 cannot view or unlock School 1 attempts (returns 404).

---

### C. BE-02B: Runner Auto-Saves, Atomic Submit & Durable Receipt (11/11 Tests Passing)
- **`POST /api/v1/attempts/:attemptId/answers`**:
  - Atomic revision batch upsert into `attempt_answers`.
  - Enforces `clientSeq` monotonically increasing per item.
  - Replaying identical sequence numbers returns 200 OK.
  - Replaying an existing sequence number with a conflicting answer returns 409 `REVISION_CONFLICT`.
  - Acknowledges older out-of-order batches as superseded without overwriting newer saves.
- **`POST /api/v1/attempts/:attemptId/submit`**:
  - Captures `receivedAt` timestamp before acquiring database row locks.
  - Timing rule: Rejects submissions after `finalAcceptUntil` with 409 `RECOVERY_REQUIRED`.
  - Validates that every question is answered (or explicitly null), rejecting duplicates/missing items with 422 `VALIDATION_ERROR`.
  - Rejects `finalSeq` lower than `highestAcceptedSeq` with 409 `REVISION_CONFLICT`.
  - Generates `snapshotDigest` tuple and matches exact SHA-256 hash.
  - Deterministically scores the submission against frozen `exam_items` correct keys and marks.
  - Commits `submissions`, marks `attempts.state = 'submitted'`, and creates `official_results` in a single ACID transaction.
  - Idempotent: Replaying the submission with the same `Idempotency-Key` and payload returns the original 200 receipt; replaying with different payload returns 409 `REVISION_CONFLICT`.
- **`GET /api/v1/attempts/:attemptId/receipt`**:
  - Reads durable receipt (`status`, `receiptId`, `acceptedAt`, `snapshotDigest`, `idempotencyKey`, `finalSeq`) without requiring device credentials.
  - Rejects attempts after finalization with 409 `ALREADY_FINALIZED`.

---

### D. BE-02C: Late Recovery, Admin Decisions & Device Transfer
- **`POST /api/v1/attempts/:attemptId/recovery`**:
  - Gated by `serverNow > finalAcceptUntil`. Calling before deadline returns 409 `REVISION_CONFLICT` with `retryAt`.
  - Once deadline passes, accepts late complete snapshot with audit reason and Idempotency-Key.
  - Validates known device generation and item membership.
  - Stores immutable record in `recovery_uploads` and transitions attempt to `recovery_pending`.
  - While in `recovery_pending`, blocks further ordinary saves and submits with 409 `RECOVERY_REQUIRED`.
- **`POST /api/v1/recovery/:recoveryId/decision`**:
  - Protected by `@Roles('school_admin')` and requires MFA-verified admin session.
  - Decision `'accept'`: Deterministically grades the recovery answers snapshot, inserts official submission and `official_results`, updates recovery status to `accepted`, marks attempt as `submitted`, and settles competing pending uploads as `rejected`.
  - Decision `'reject'`: Rejects upload with non-empty reason; if no other pending uploads remain, sets attempt state back to `awaiting_upload`.
- **`POST /api/v1/attempts/:attemptId/device-transfer`**:
  - Admin only.
  - Verifies replacement device is already enrolled by the student.
  - Increments `device_generation`, resets `highest_accepted_seq = 0`, sets state to `preparing` until unlocked on new device.
  - Preserves previously server-confirmed answers as baseline `clientSeq = 0`.
  - Invalidates old device generation (old device receives 409 `DEVICE_REPLACED`).

---

## 4. What Remains To Be Done (Your Implementation Roadmap)

### Immediate Next Step
- **Finalize BE-02C Test Execution (`test/be02c-recovery-transfer.e2e-spec.ts`)**:
  - The endpoints and tests are written. Run `npx vitest run test/be02c-recovery-transfer.e2e-spec.ts` to confirm 11/11 tests pass.

---

### Module BE-03: Exam Authoring, Imports & AI Tagging
1. **Teacher Exam Authoring API**:
   - `POST /api/v1/authoring/papers`: Create new exam paper metadata (title, subject, grade, duration, instructions).
   - `POST /api/v1/authoring/papers/:paperId/versions`: Create new draft version.
   - `PUT /api/v1/authoring/versions/:versionId/items`: CRUD exam items (MCQ single, multiple choice, true/false, short answer, essay).
   - Item schemas: `item_id`, `type`, `stem`, `options` (`[{ id, text }]`), `correct_key`, `marks`, `explanation`.
2. **Document & Spreadsheet Import Pipeline**:
   - `POST /api/v1/authoring/papers/:paperId/import`:
     - Accept Word (`.docx`) and Excel (`.xlsx`) files.
     - Parse formatted questions, extract option lists, detect bold/highlighted answer keys.
     - Validate marks summation against paper target total.
3. **AI Assistance & Tagging Engine**:
   - `POST /api/v1/authoring/items/ai-suggest`:
     - Topic tagging, Bloom's taxonomy classification, estimated difficulty level.
     - Distractor generation for multiple-choice options.
     - Rubric generation for structured/essay questions.

---

### Module BE-04: Workflow, Approvals, Scheduling & Results Publishing
1. **Approval Workflow State Machine**:
   - Transitions: `draft` -> `submitted_for_review` -> `approved` -> `frozen`.
   - `POST /api/v1/authoring/versions/:versionId/submit-review`: Teacher submits.
   - `POST /api/v1/authoring/versions/:versionId/decision`: Admin/Head of Department approves or requests changes with comments.
   - Once approved, version is frozen and cannot be modified.
2. **Session Scheduling & Rostering**:
   - `POST /api/v1/schedules/sessions`: Create exam session linked to approved frozen version.
   - Assign classes/sections, configure `preparation_visible_at`, `starts_at`, `ends_at`.
   - Configure student accommodations (`extra_time_minutes`) in `session_roster`.
   - Trigger automated generation of AES-256-GCM package and store in `exam_packages`.
3. **Results Gating & Official Publication**:
   - Exam results remain hidden from students after submission until school admin publishes them.
   - `GET /api/v1/admin/sessions/:sessionId/results`: Admin reviews cohort scores, statistics, and pending recovery uploads.
   - `POST /api/v1/admin/sessions/:sessionId/publish-results`:
     - Checks publication gate: All attempts must be finalized (`submitted` or `invalidated`), and zero `recovery_pending` uploads remain.
     - Unlocks student visibility (`GET /api/v1/me/exams/:sessionId/result`).

---

### Module BE-05: Practice Mode, Student Analytics & Grade Exports
1. **Self-Paced Practice Engine**:
   - `POST /api/v1/practice/sessions`: Start un-timed or timed practice sitting from question bank.
   - `POST /api/v1/practice/sessions/:id/answers`: Immediate check with explanations, rationale, and topic hints.
2. **Student & Cohort Performance Analytics**:
   - Topic mastery breakdown (e.g., Algebra: 85%, Geometry: 42%).
   - Class-wide item discrimination index ($r_{pbis}$) and difficulty index ($p$-value).
3. **Grade Card Exports**:
   - Export CSV / PDF format conforming to school grading scales and Ministry of Education standards.

---

## 5. Environment & Credentials Reference

### Configuration (`.env`)
```env
DATABASE_URL="postgresql://postgres.lyayegcssorznzxotcuw:%26*aEuVMhT%24c2!7t@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
MIGRATION_DATABASE_URL="postgresql://postgres.lyayegcssorznzxotcuw:%26*aEuVMhT%24c2!7t@aws-0-eu-west-1.pooler.supabase.com:5432/postgres"
SESSION_SECRET="nexora-secret-session-key-32bytes-long-super-safe"
APP_ORIGIN="http://localhost:5173"
CORS_ORIGIN="http://localhost:5173"
PORT=3000
NODE_ENV="development"
DB_POOL_MAX=5
```

### Seeded Synthetic Test Accounts
| School | Role | Login ID | Password | 2FA / TOTP Secret |
|---|---|---|---|---|
| **Hillside Academy** | School Admin | `HILL-ADM01` | `AdminPass123!` | `JBSWY3DPEHPK3PXP` |
| **Hillside Academy** | Teacher | `HILL-TCH01` | `TeacherPass123!` | None |
| **Hillside Academy** | Student 1 | `HILL-STU01` | `StudentPass123!` | None |
| **Hillside Academy** | Student 2 | `HILL-STU02` | `StudentPass123!` | None |
| **St. Mary Academy** | School Admin | `MARY-ADM01` | `AdminPass123!` | `JBSWY3DPEHPK3PXP` |
| **St. Mary Academy** | Student | `MARY-STU01` | `StudentPass123!` | None |

### Useful CLI Commands
```bash
# Apply SQL migrations to Supabase
npm run migrate

# Re-seed staging users, exam papers, and sessions
npm run seed

# Run all automated tests (crypto, BE-02A, BE-02B, BE-02C)
npm test

# Run a specific test suite
npx vitest run test/be02a-preparation.e2e-spec.ts
npx vitest run test/be02b-runner-submit.e2e-spec.ts
npx vitest run test/be02c-recovery-transfer.e2e-spec.ts

# Start backend development server
npm run start:dev
```

---

## 6. Golden Rules for Continuing Development
1. **Never mock repositories**: Always run real queries against PostgreSQL inside `withTenantTransaction`.
2. **Never leak answers or unreleased scores**: Student packages are encrypted with AES-256-GCM. Plaintext items never include `correct_key`, `correct`, or `explanation`. Official scores are never returned until officially published.
3. **Direct JSON only**: Return direct objects or arrays (e.g. `{ items: [...] }`), never `{ data: { ... } }`. Empty successes return `204 No Content`.
4. **Exact Error Envelope**: Every exception must use `DomainException` to return `{ code, message, details, requestId, context? }`.
5. **Always Set Tenant Context**: Every database transaction must begin with `set_config('app.current_school_id', schoolId, true)` to ensure Row-Level Security protects student privacy.
