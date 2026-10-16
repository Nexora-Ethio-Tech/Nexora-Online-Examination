# Student runner increment

Implemented against contract v0.3 and BE-02. Backend integration remains unverified. This extends the previous preparation increment.

## Try the demo

Run `npm run dev:demo` and use DEMO-STUDENT / NexoraDemo!. Refresh schedule now displays a confirmation and last-checked EAT time, even when unchanged.

Mathematics opens 30 seconds after the demo simulator starts, and lasts two minutes. Its preparation window still begins exactly ten minutes before common start; the seed is already inside that window. Download its encrypted paper and keep the tab open: it navigates to the runner at common start and requests authorized unlock. English is already open and lasts five minutes from its common start (approximately three minutes remain when the demo starts). It can be used immediately.

The demo paper contains ten synthetic objective questions. Select answers, use question navigation, upload saved answers, then Review and submit / Confirm submission. Unanswered items are included as null. Expect Submitted only after a matching receipt. Alternatively let the deadline expire for automatic finalization.

Demo sessions and simulated server records remain in memory. A full page reload resets that simulated backend, although IndexedDB evidence remains. Reload/reauthentication acceptance therefore requires the real backend; automated controller tests reuse a simulated server across new runner instances. Do not interpret a reset demo's missing server attempt as loss of local answers. No real grading, MFA/security, admin recovery decision or load evidence is claimed by mocks. Do not put real school data in the demo.

## Implemented behavior

- Strict AES-GCM package decryption after online timed unlock, with hash, versions, generation, time, item/option membership and order validation. Keys and question text remain in memory, never persistent browser storage.
- Server-time clock plus monotonic elapsed time. Older server samples never move the active timer backward. Backend timing still controls acceptance. Timer callback delays are handled by recomputing elapsed time.
- One writable tab through Web Locks. A second tab cannot edit. Browsers without Web Locks fail closed with a browser-support message; no unsafe lease/takeover fallback.
- IndexedDB partitions records by school/student/attempt/version/schedule/generation. Each answer and outbox edit commits atomically; success follows transaction completion. A failed edit stays visibly unsaved and can be retried.
- Confirmed server revisions reconcile without overwriting newer local work. Disputed values stop editing and retain evidence. Only exact acknowledgements retire matching pending revisions.
- Background uploads with jitter/backoff, manual upload and reconnect retry. Network interruption after unlock permits local answers while the tab stays open. Reload needs online auth/device/state/time revalidation before editing.
- Complete immutable final body and stable UUID persisted before POST. Timer expiry locks edits; in-flight saves cannot delay submission or change an accepted final snapshot. Lost responses retain the request for replay/reconciliation.
- Submitted requires a matching digest; receipt reads additionally correlate the retained request key and final sequence. Scores are not displayed before school release.
- Late/disputed evidence can be uploaded with a separate retained UUID and reason. Recovery pending is distinct from Submitted; actual admin acceptance/rejection requires BE-02C.
- Navigation guard while editing, browser unload warning for unresolved work, and retained local evidence across logout/401. Signing out does not delete IndexedDB.

## Offline app assets

Production builds emit sw.js with a build-specific cache and SHA-256 manifest of the app HTML, scripts, styles and fonts. Installation verifies assets; readiness rechecks every cached asset. Requests for API/auth/private exam data bypass this cache. The worker never skipWaits, claims active clients or deletes older caches. An incompatible/waiting build blocks readiness and gives safe close/reopen guidance.

Development modules are not a versioned offline shell. The demo labels this limitation and requires its development server to remain available; it never claims full offline readiness. Production preparation requires actual shell verification before unlock. Offline reload cannot reopen an editable paper until online authentication and reconciliation succeed.

## Verification and remaining acceptance

Automated tests cover the issued crypto/digest vector, forbidden grading fields, order validation, clock rollback, atomic edits, quota failures, late acknowledgements, offline edits/reconnect, new-instance restoration, offline reopen refusal, lost responses after deadline, in-flight-save/final races, automatic expiry, 401, replaced-device evidence, receipt mismatch, tenant partitions, writable-tab exclusion, shell integrity/cache eviction and refresh feedback.

Unit and browser-demo checks do not replace real backend, Android hardware/network, production service-worker lifecycle, safe deployment, database race and capacity tests. Old offline caches/evidence are retained deliberately; cleanup requires a separately defined confirmed-resolution/retention policy. Teacher/admin workflows and results/practice now exist. See master-plan-audit.md for remaining gaps, including collapsible navigation and cold-reload recovery guidance. Backend instructions are in backend-runner-integration.md; the existing contract is unchanged.
