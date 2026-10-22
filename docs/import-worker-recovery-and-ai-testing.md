# Import worker recovery and AI testing

22 October 2026. Local implementation; no deployment or production database change.

## Problem and architecture

Uploads remained queued because the worker queried schools without tenant context. The restricted database role correctly returned no rows under row-level security. The worker was alive but never claimed uploads. Mock-only sweep tests did not catch this.

The worker now uses an explicit operator-maintained `WORKER_SCHOOL_IDS` list (comma-separated UUIDs, at most 1000, sorted and deduplicated). Each sweep selects one configured ID and looks it up inside a tenant transaction. Inactive or missing schools are skipped while preserving the continuation cursor. A missing list fails visibly. Trusted, authenticated triggers may still specify `schoolId` directly. No RLS bypass, owner database connection or new migration is required.

Add newly provisioned schools to the worker configuration and restart it, or schedule authenticated per-school triggers. This is an explicit operational requirement; provisioning does not update that list automatically. On Vercel, configure the same list and follow `nextCursor` in the trusted scheduler; a returned cursor is not evidence that another invocation occurred.

The local private configuration now includes the existing test school's UUID. Start the worker from the repository root with `node scripts/local-test.ts worker`. It prints startup and readiness messages. Keep the terminal open. Rebuild the backend before restarting after source changes. Existing cancelled uploads remain cancelled.

## Providers and safety boundaries

The original environment selected OpenRouter, not Groq or Gemini. The supplied Groq/Gemini keys are now in the ignored backend `.env`; they are not in this guide or Git. Rotate credentials shared in chat.

- `GROQ_API_KEY` and `GROQ_MODEL`: primary provider, fixed official Groq endpoint.
- `GEMINI_API_KEY` and `GEMINI_MODEL`: fallback provider, fixed official Google OpenAI-compatible endpoint.
- If neither provider key exists, the existing `OPENAI_*` configuration remains supported. Partial selected-provider configuration fails rather than silently using the legacy provider.
- Fallback is at most one additional request, for transport/timeouts, rate limits, server errors, or HTTP 401/403/404. Refusals, content filters, malformed output and schema failures do not trigger fallback. Each attempt has a 30-second timeout; the two-attempt bound fits the existing 90-second AI lease.
- Reservations cover both potential provider attempts. The successful model is recorded. Usage fields describe the successful response, not unknown billing from a failed request. Existing retry/budget/lease controls remain in force.
- Response validation still preserves teacher answer keys. Raw provider errors, credentials and question contents are not logged.

Implementation references: [Groq structured outputs](https://console.groq.com/docs/structured-outputs) and [Google OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai).

File parsing is deterministic and happens before AI review. It requires the supported Word/Excel question template with answer keys; this change does not add extraction from arbitrary spreadsheets, scanned documents or images. AI suggests topics and explanations after parsing. Cancelling an upload does not reset a stopped or misconfigured worker.

## How to test

1. Follow [local integrated setup](local-integrated-testing.md); start the worker in addition to the APIs and frontend.
2. As a teacher with an assigned class/subject, create a fresh draft and upload a provided Word/Excel template. Expect questions to appear, then AI suggestions. Review the actual contents before submission.
3. Reload the draft and confirm the questions persist. Upload an invalid replacement: expect diagnostics and preservation of previous questions.
4. Cancel a pending import. It must remain cancelled even when the worker continues; create a new upload to retry.
5. Stop the worker, upload a test file, and observe the waiting state. Restart it and confirm progress without re-uploading. The UI now explains that a saved queued file has not yet been read.
6. From `nexora-backend`, run `node dist/scripts/check-ai.js` to show only configured provider hosts/models. Add `--live` to send one synthetic arithmetic question to each configured provider. This can consume provider quota; it does not send school records. Failures print only sanitized codes.
7. From the root, run `node scripts/local-test.ts test`. The real API/database import case now calls `WorkerSweepService`, so it checks tenant discovery as well as file parsing. Its AI response is synthetic; live provider checks are separate.

## Verification

- Backend build passed. Real local integration: 18 cases passed, including upload through the repaired sweep and preservation after invalid replacement.
- Live Groq `openai/gpt-oss-120b`: structured response verified on a synthetic question.
- Live Gemini `gemini-flash-latest`: HTTP 503; fallback availability is not certified. Unit tests cover fallback routing and separate credentials.
- The local worker was restarted with the corrected scope and reports ready. The user's two prior imports had already been cancelled and had no retained source bytes to replay.
- Final checks passed: 168 backend unit tests; frontend typecheck, lint, formatting, 229 component/unit tests, 14 release/local-config checks; frontend production build (existing chunk-size and dependency annotation warnings). No production rollout, load test, or arbitrary-document extraction is claimed.
