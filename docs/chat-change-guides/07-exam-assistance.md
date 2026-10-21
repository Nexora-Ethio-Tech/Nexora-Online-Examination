# Student assistance pause and scoped staff approval

Verified change history through `ed01fe2`, 21 October 2026. Commit(s): 8458e21.

## Precisely what changed

- Added migration 022: assistance pause flag, sitting-scoped teacher assignments, expiring requests, tenant constraints, forced RLS and grants.
- Added student request/status APIs and staff sitting/inbox/assignment/decision APIs with browser binding, ownership and assignment checks.
- Added Pause and request assistance, staff Exam assistance UI, fresh MFA/reason requirements, replay handling and audit records.
- Pauses editing immediately while retaining answers/outbox and the original deadline. Requests last at most five minutes and never beyond the deadline.
- Approval clears only assistance pause; the student must revalidate and reopen. Rejection/expiry leave editing paused. Administrative suspension remains separate.
- Extended the protected MFA operator to teacher enrollment; no new invigilator role or automatic blur-lock policy was added.

## How to test

Read [setup and common checks](README.md) first. Backend commands run inside `nexora-backend`; browser/k6 and Git commands run from the repository root.

```powershell
npm run test:unit -- test/unit/assistance.spec.ts
```

1. Use isolated staging with two schools, an admin, assigned/unassigned teachers and a student. Reconcile migration history before applying 022.
2. Enroll teacher MFA privately and assign that teacher to one sitting. Unassigned teachers and other-school accounts must not read or approve its requests.
3. Start an exam, save an answer, then request assistance. Expect hidden paper, rejected new save/unlock operations, retained answer/outbox and unchanged deadline.
4. Approve on a separate staff device with a fresh code and reason. Student revalidation must restore the saved answer.
5. Repeat with wrong/reused code, rejection, five-minute expiry, lost response, logout and reload. Verify no duplicate decision and no exposure of MFA secrets.
6. Race approval with revocation, device transfer, administrative suspension and deadline. Verify one consistent database outcome and audit record.
7. Let the deadline arrive while paused. Saved evidence must still reach the normal finalization/receipt or pending-recovery path.

## Evidence and remaining limits

Migration 022 has not been applied. Real PostgreSQL races, RLS and two-device acceptance remain pending. Demo mode does not implement the full approval workflow.

See the [detailed implementation guide](../invigilation-architecture-and-testing-plan.md) and [exact commit/file inventory](COMMIT-FILE-INVENTORY.md). Record actual results using the [test report template](TEST-REPORT-TEMPLATE.md); do not mark unperformed checks as passed.
