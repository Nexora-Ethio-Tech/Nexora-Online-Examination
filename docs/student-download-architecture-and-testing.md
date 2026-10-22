# Student download display

## Behavior and architecture

Students see **Not started**, download progress, **Finishing download…**, or a clear completion/failure message. The internal preparation checklist is no longer displayed, including the offline-check instruction. Schedule and deadline information remains visible.

The existing API client optionally reads response chunks and counts received bytes for exam packages. With a usable uncompressed Content-Length, the page shows percentage received. Missing or compressed lengths show an indeterminate progress bar until receipt completes; the UI never invents a percentage. A network percentage of 100 does not establish readiness: the UI says Finishing download while verification continues.

The same preparation pipeline still validates attempt/package identity, verifies SHA-256, saves the package to IndexedDB, checks the offline shell and reports identity-bound readiness only with a verified production shell. Development bypass never reports readiness. Existing actionable failure messages and retry behavior remain. Progress is transient UI state, not a replacement for persisted package data or school readiness evidence.

## Test on the integrated local system

1. Sign in as a local student with a scheduled exam. Open its preparation page; expect Not started before downloading.
2. During preparation, click Download exam. On a throttled connection, observe received-byte progress. Small packages may finish too quickly to display intermediate percentages.
3. Confirm no internal checklist or “Check that you can keep working…” message appears. Wait for the completion message and keep the page open until the common start.
4. Interrupt the connection during download. Expect an actionable failure and retry control, not a false success. Reconnect and retry.
5. Test a production build separately for verified offline-shell readiness. Development testing does not prove offline availability.

## Automated evidence

Stream tests cover split UTF-8 bytes, byte totals, compressed/unknown lengths, invalid JSON and aborting a stalled download. The existing corrupt-package UI test proves verification still fails and a valid retry succeeds with the simplified display. Existing readiness tests preserve reporting gates.
