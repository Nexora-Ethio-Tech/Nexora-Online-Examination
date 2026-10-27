# Account IDs and eight-character passwords

Current local status: see [24 October alignment and test results](local-release-readiness.md). Historical limitations below refer to the earlier run.

## What changed

New students receive `STU/SID/NNNN/YY`, for example `STU/001/0001/19`. New teachers receive `TCH/SID/NNNN`, for example `TCH/001/0001`.

SID is the platform-wide numeric school identity, padded to at least three digits. It is assigned by PostgreSQL, unique, and immutable even when a school is renamed. Existing schools receive numbers when migration 028 is applied; their order is not a ranking. Do not assume that a particular existing school will receive 001. After 999, school numbers expand to four digits.

Student and teacher counters are separate within each school. Student numbering continues across classes and Ethiopian years. Both counters survive account deletion and expand beyond 9999. Existing student counters and legacy numbered student IDs establish the high-water mark; old UUID-based teacher IDs remain unchanged and do not consume the new numeric teacher series.

YY is the last two digits of the Ethiopian year at student account creation, calculated in Africa/Addis_Ababa. Existing IDs never change automatically. Reimport protections still use the student's roster reference, not their name; a repeated reference is rejected rather than silently creating another account. Roster references remain separate from generated login IDs.

Newly issued/reset school-account passwords contain exactly eight characters, including uppercase, lowercase, a number and a symbol. Symbols are selected from `!#$%&*?`, avoiding spreadsheet formula prefixes. Backend generation uses cryptographically secure randomness with rejection sampling. Passwords are salted Argon2id hashes in the database; plaintext is returned only in the original credential response. Idempotent replay returns metadata with no passwords. Downloaded credential CSVs remain private material controlled by the administrator.

Updated 26 October: the primary roster flow now reviews and saves students with their login details in one transaction, followed by one private CSV download. Accounts retains manual issuance for legacy unissued students and individual editing/reset. See [compact portal forms and lists](compact-portal-forms-and-lists.md) for the additive commit contract and deployment requirements. Teacher creation issues credentials immediately. This change does not add a forced first-login password-change screen; that earlier recommendation remains a separate authentication workflow. Existing passwords are not reset by migration. Invigilator IDs and platform-owner/admin provisioning formats remain unchanged; school-directory credential issuance/reset uses the eight-character generator.

## Architecture

- Migration `028_account_numbering.sql`: school identity column, uniqueness and immutability protection, teacher counter table with forced tenant RLS and restricted grants.
- Student allocator recognizes legacy and new formats, and preserves its counter through deletes. Teacher allocator uses atomic counter updates. Both run inside the existing school-directory transaction and idempotency boundary.
- Login already accepts slashes. Account editing now accepts the slash format in its HTML and frontend/backend validation.
- Demo generation mirrors the formats with SID 001 and independent in-memory counters. Demo password hashing is not production password storage.
- No new dependencies. Existing tenant authorization, MFA gates, credential replay rules and audit redaction are preserved.

## Manual testing order

1. Apply migration 028 to a separate test database before running the new backend. Restart backend and frontend. Do not run migrations against production without the normal deployment review.
2. As school admin, import two new roster references into different classes. Confirm both imports and issue credentials. Check `STU/<same SID>/0001/YY`, then the next available number; existing accounts can make the starting number higher. Check YY against the Ethiopian creation year, not the Gregorian year.
3. Repeat the same import/reference. Confirm there is no second account. Retry the original credential request: passwords must not be revealed a second time.
4. Create two teachers. Their IDs must use TCH, the school's same SID, and consecutive teacher numbers independent of student numbers.
5. Verify every password is eight characters and contains all four character types. Sign in with the exact displayed or downloaded credentials. Open Edit on a slash-formatted account and save an unrelated name change without a validation error.
6. Delete an unused account, create another, and confirm its number is not reused. Rename the school: new IDs retain its SID. Verify existing legacy accounts still sign in.
7. Reset a test account password: the ID stays unchanged, the password follows the new rule, and the old password stops working. Check a second school has a different SID and cannot read or update the first school's counters.

## Validation

Migration 028 was successfully applied to the designated disposable database `127.0.0.1:55432/nexora_be02a_test`, together with pending migrations 026 and 027. Production and `nexora_manual_test` were not modified. The manual test database still needs migration 028 before this backend version can create accounts there.

Backend unit and isolated schema suite: 222 tests passed, including Ethiopian New Year at midnight EAT, number overflow, password composition, concurrent teacher allocation, rollback and tenant isolation. Frontend typecheck, lint, formatting, 272 tests and 14 tooling checks passed. Frontend and backend production builds passed. The mobile Chromium account-management/onboarding journey passed. Two focused real API tests passed for teacher creation, roster imports, password composition, Argon2 verification and replay redaction.

The broader operational suite was also run: 19 passed and four failed in result publication, recovery, practice availability and a practice browser click intercepted by onboarding. These failures are not hidden or treated as a passing full acceptance run. A whole-backend test-source TypeScript check additionally reports mock typing errors in unchanged generation-policy and package-preparation tests; the production backend build passes.
