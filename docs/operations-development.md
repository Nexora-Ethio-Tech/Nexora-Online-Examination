# Verified operations implementation

20 October 2026. Development starts from reported production commit `845a8ea`, preserving AI exam generation and immediate package preparation. Vercel remains the current target; HahuCloud is a future option. The older development report is not acceptance evidence.

## School provisioning

Run from `nexora-backend` in a private interactive terminal:

```text
npm run school:provision -- --school-name "Example School" --school-slug example-school --login-id EXAMPLE-ADMIN --display-name "School Administrator" --operator "Authorized operator" --reason "Approved school onboarding"
```

This aliases the existing protected `mfa:operator bootstrap` workflow. It validates the slug, generates a random password, stores an Argon2id hash and records operator/reason in `audit_events`. The administrator stays inactive until a fresh authenticator code confirms enrollment. Do not pass passwords or authenticator secrets as shell arguments. If enrollment is interrupted, use the existing enroll flow with the created school/admin IDs; do not bootstrap a duplicate school.

## Background work

`npm run worker -- --once` sweeps active schools; omit `--once` for continuous operation. The existing `--school <UUID>` filter remains supported. Each page processes one school, preparing packages before imports/AI. Database leases arbitrate repeated/concurrent triggers.

External schedulers POST `/api/v1/internal/import-worker` using `IMPORT_WORKER_SECRET`, start with `{}` and follow each `nextCursor` as `{ "afterSchoolId": "<cursor>" }` until null. Only then start another sweep. Retry failures at the same cursor or surface them to the operator.

GET on that path accepts those fields as query parameters and authenticates with `CRON_SECRET`, matching Vercel's cron convention. For fixed Vercel cron requests, configure an explicit `schoolId` per school. A fixed GET without a school/cursor always starts at the first active school; it is not a complete multi-school scheduler.

No automatic cron schedule is enabled. Confirm the Vercel plan and function duration first. One school can still perform several bounded provider calls; the host needs sufficient duration. On a short-duration plan use a separate persistent worker. Never start an endless worker inside a Vercel request or rely on work continuing after a response.

- [Vercel cron security and duration](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel cron frequency limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

## Amharic support

The AI review adapter preserves teacher questions, option IDs and the supplied answer key. That key is necessary to assess consistency and explain the answer; it must not be stripped from this staff-side request. Student identities and answer histories do not belong in that payload.

Generated topics, explanations and review flags use NFC normalization. Synthetic tests check Amharic wire data and normalization using a decomposed Latin accent alongside Ethiopic text; Ethiopic letters alone do not demonstrate normalization. A subject reviewer must still evaluate real output for accuracy, language, truncation, refusal and provider failures.

Noto Sans Ethiopic regular/bold fonts are bundled locally and included by the existing build shell cache. A CSS fallback name alone does not install a font on a student's device.

## Acceptance boundary

Local verification completed on 20 October 2026: frontend typecheck, lint and formatting passed; 199 frontend unit tests and 9 release-source tests passed; backend build and 93 unit tests passed; frontend production build passed with the existing large-chunk warning. Sandboxed esbuild startup initially failed on filesystem access; the tests passed with normal access. No live database, restore, provider-quality or k6 run was performed.

Database restore, operator enrollment, hosted workers, live AI quality, load and phone/offline checks require separate recorded runs. Synthetic tests/builds do not prove these. See the backup, load and future-host guides.
