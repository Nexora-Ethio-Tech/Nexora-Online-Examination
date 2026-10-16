# Administrator recovery review frontend

API v0.7 / BE-06. Admin-only Recovery review navigation contains pending/all lists, detail comparison of latest timely saves against immutable uploaded final answers, server timestamps including seconds in EAT, device-generation evidence, related uploads and audited accept/reject decisions. A decision requires selection, reason and confirmation. Read-only history remains available after settlement. Accepting creates a candidate result revision; publication remains a separate administrator step.

## Quick demo test

1. Run npm run dev:demo and sign in as DEMO-ADMIN / NexoraDemo!, MFA 123456.
2. Open **Recovery review**, then **Load synthetic recovery example**. This button exists only in demo mode. The example is clearly labeled synthetic and does not represent a real student's browser upload.
3. Inspect the student upload reason, received/deadline times and the answer comparison. Choose Accept this snapshot or Reject this upload, type the decision reason and check the review confirmation. Confirm the decision.
4. The saved decision shows actor, reason and timestamp. Accepting links to the new official result revision; approve its publication separately to release the score. Rejecting preserves evidence and creates no receipt/score.
5. Return to Recovery review and choose All uploads and decisions to see the retained case. The example button reopens the same case; reloading the whole demo resets its in-memory state if you want to test the other decision.

The synthetic example tests the admin/results screens. It does not create a student's local IndexedDB final snapshot. The automated integration scenario separately creates a real simulator attempt, saves an answer, uploads late evidence, decides it and checks the student's matching receipt. Real browser/network/backend acceptance is still required.

## Real backend integration test

Use a teacher-created, approved scheduled paper. Unlock as the student, retain local answers during an actual API outage, and reconnect after the final acceptance window. Send retained answers for review with a reason. In the admin portal review that exact case, accept/reject with a reason, then return to the student runner and use **Check school decision**. Acceptance must correlate exact digest, finalSeq and the recovery upload key before showing Submitted. Rejection leaves local evidence retained. Do not clear browser storage during this test.

No production outage is authorized by this guide: simulate an interruption in a controlled test environment. The in-memory demo transport is not a real network service, so browser offline controls alone do not prove a failed demo API request.

## Scope and verification

Mocks preserve multiple uploads, timely evidence and settled history; acceptance supersedes competing pending cases and updates official results without republishing. Production responsibility is fully specified in backend-recovery-task.md. Existing student DTOs/receipt correlation and BE-05 publication interfaces are unchanged. Demo simulation is single-school/single-student and does not prove real isolation, database locking/restarts, disputed-device transfer or capacity.

Tests exercise actual simulated late upload → admin decision → student receipt, rejection, competing cases, stale/idempotent decisions, role restrictions, evidence retention, published revision preservation and React confirmation/history. Run npm run check and npm run build; final counts and outcomes are reported in the delivery response. No new dependencies.

Browser automation has been unavailable in this workspace due to its kernel-assets initialization error. Live phone/layout verification remains manual. Keep the existing demo tab open between roles; full reload resets simulated server state. Production does not bundle the demo example or its endpoint.
