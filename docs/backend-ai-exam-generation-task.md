# School-controlled AI exam generation

Owner-requested addition, 18 October 2026. Implemented source adds AI generation as an alternative to template upload. Existing upload, teacher review, administrator approval, delivery, results and practice contracts remain in force. This is implementation and test guidance, not hosted acceptance.

## School setting

`GET /school/ai-exam-settings` is available to authenticated teachers and MFA-authorized school administrators. Return `{aiExamGenerationEnabled:boolean,revision:positive integer}` for the session's school. A school with no setting returns false and revision 1.

`PATCH /school/ai-exam-settings` is school-admin-only, with CSRF and Idempotency-Key. Body: `{aiExamGenerationEnabled,revision,reason}`; reason is required, trimmed and at most 2,000 characters. Changes are revision-bound, audited and replayable without another revision or audit event. Teachers and students cannot change the policy. No school ID is accepted from the browser.

School setup → AI settings shows the current saved state and an explicit on/off action. Uploading is always available. Disabling invalidates generation requests admitted under the earlier policy revision, including requests already running. Re-enabling does not revive those requests. Previously committed papers and ordinary uploaded-question AI assistance are unaffected.

## Teacher generation

Teachers create an ordinary draft, save its assignment and language, then use Questions → Generate an exam with AI. `POST /exams/:id/generate` accepts the executable `generationInputSchema` in `src/features/exams/authoring/generation-schemas.ts` and returns the existing import-job DTO with HTTP 202. The backend schema is generated from that source with `node scripts/sync-generation-contract.ts`; the contract-alignment test rejects drift.

Fields: revision; topics (required, at most 4,000 characters); guidance (optional empty text, at most 4,000); difficulty (`easy`, `medium`, `hard`, `mixed`); mcqCount and trueFalseCount (nonnegative integers, combined 1–50); marksPerQuestion (integer 1–100); replaceExisting (boolean). Current question types remain single-answer multiple choice and true/false. Subject, class, language and school come from the authorized draft/session, never teacher-supplied provider context.

Require active assignment ownership, editable draft/returned state, matching revision, no queued/processing source replacement, school opt-in and configured provider. Replacing nonempty papers needs explicit confirmation. Queue admission and source pointer/revision update are atomic and idempotent. Committed identical requests replay the same job even after policy changes; a changed body with the same key conflicts. Job reads remain owner-scoped; they never perform provider work.

The existing durable import worker processes generation requests. Policy checks occur before dispatch and before committing output, using a common school lock and admitted policy revision. Generation shares the existing two-call school AI concurrency allowance, reserves tokens, uses bounded leases and limits restart recovery to three attempts. Provider failures are explicit; no automatic fabricated paper or partial replacement. Teachers can issue a new request after a visible failure. Prior questions and review states survive failure. Ordinary template upload remains usable while the setting is off.

Provider output must contain the exact requested type counts, valid option IDs and keys, distinct questions/options, topics and explanations. Marks and item identities are assigned by the server; all generated items start unreviewed. Original generation input, validated output, prompt version, model and usage remain on the durable job; ordinary authoring snapshots preserve changes. No generated paper bypasses human review, administrator approval, package privacy or release gates.

## Deployment and acceptance

Apply `nexora-backend/migrations/020_ai_exam_generation.sql`, deploy backend and frontend together, and run the existing authenticated import-worker scheduler or local worker. No new dependency or provider key is required. Existing backend-only OPENAI_API_KEY, OPENAI_BASE_URL and OPENAI_MODEL settings are reused. AI_EXAM_MAX_COMPLETION_TOKENS defaults to 16000, supports the existing adapter range 256–16000, and is separate from ordinary question-review output allowance. Large papers may fail explicitly if the provider truncates or times out; no full-paper quality/latency claim follows from a small English review sample.

Verify real role/MFA/tenant denial, setting and generation replay/conflict, concurrent disable/re-enable versus output commit, ownership changes, expired leases, worker restarts, provider refusal/truncation/budget failures, unchanged prior paper on failure, exact question mix/marks, teacher review and admin approval, and upload while disabled. Synthetic demo generation uses visibly labeled mathematics fixtures; it does not call a provider or prove arbitrary-subject quality. Amharic generation remains unverified. This task does not authorize a paid live-provider check or assert deployment/database acceptance.

## Verification recorded on 18 October 2026

- `npm run check`: passed TypeScript, ESLint, formatting, 198 frontend tests and nine release-source tests. The release-source subprocess tests required execution outside the sandbox. An existing formatting failure in the MFA operator script was corrected without changing behavior.
- `npm run build`: passed as the browser suite's prebuild, with the existing large-chunk and dependency-comment warnings.
- `npm run build --prefix nexora-backend`: passed after the final backend changes.
- Backend `npx vitest run test/unit`: 81 tests passed, including provider-output and policy-revision checks; execution outside the sandbox was needed for SWC's native binding.
- Browser suite with `E2E_BROWSER_CHANNEL=chrome npm run e2e`: 26 existing journeys passed; three new AI journeys reached review but failed on an overly exact label locator. After correcting the locator to the question textbox's accessible role/name, `E2E_BROWSER_CHANNEL=chrome npx playwright test --last-failed` passed all three new journeys on desktop, 360px mobile and landscape. Accessibility assertions remained enabled. The default Playwright browser was absent, so the installed Chrome was used.

These are synthetic API/provider and browser checks. Migration 020 remains unapplied by this task. Real database races, scheduler deployment, hosted end-to-end generation and live full-paper English/Amharic quality remain acceptance work. No provider credits were consumed by this task's tests.
