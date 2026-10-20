# Real-API exam load harness

`k6-exam.js` uses real synthetic credentials, CSRF/login cookies, device enrollment, attempt creation, package checksums, common-start unlock, 30-second saves, exact final digests, duplicate replay and receipt reads. It does not invent tokens, accept failed writes, seed records or test browser/offline/Wi-Fi behavior.

Use an isolated staging deployment/database. Privately provision distinct students in one approved scheduled sitting. Use fresh fixtures for each run. Keep credentials in an ignored `cohort.private.json`:

```json
{
  "origin": "https://your-staging-frontend.example",
  "sessionId": "real-scheduled-session-uuid",
  "preparationVisibleAt": "2030-01-01T09:00:00Z",
  "students": [{ "loginId": "synthetic-student-001", "password": "privately-issued-password" }],
  "answers": [{ "itemId": "real-canonical-item-id", "value": "real-canonical-option-id" }]
}
```

Include every question exactly once; null values represent intentionally unanswered items. Allow enough exam time to exercise saves. Use the actual schedule and synchronize the load machine's clock. This harness downloads/checks encrypted packages but does not decrypt/render them.

Set `TARGET_URL` to the staging API base including `/api/v1`, `CONFIRM_TEST_TARGET` to the identical URL, and `FIXTURE_FILE` to the private fixture. `STUDENTS` defaults to 500; begin small. `MAX_DURATION` defaults to two hours and must cover preparation plus the exam.

```text
k6 run tests/load/k6-exam.js
```

Preparation is spread across 570 seconds of the ten-minute window. Unlock uses the returned common start. Saves occur every 30 seconds with initial jitter. Submissions begin during the first two seconds after the deadline, leaving time within the five-second transport allowance. Thresholds require all checks to pass, one confirmed receipt and matching replay per student, p95 saves below two seconds and p95 receipts below three seconds.

After the run, independently reconcile exactly one submission per attempt, expected digests/grades, result records and retained recovery evidence. Record server resource/pool metrics, errors and k6 output against exact commits. A small-cohort pass is not 500-student acceptance. Adding this harness does not mean a load run has passed.
