# Adjustable preparation duration

## Behavior and architecture

School administrators choose **Preparation duration (minutes)** while scheduling or changing a sitting. The default is 10, with whole values from 1 through 120. Changing it clears the confirmation checkbox. The preview shows the resulting EAT start, end and latest student deadline. Approved exam duration is unchanged.

Both scheduling DTOs accept optional `preparationMinutes`. New schedules default to 10. Rescheduling without the field preserves `(starts_at - preparation_visible_at) / 60000`, supporting older clients. Existing timestamp columns persist the setting; no database migration is needed. The server computes the common start from preparation time plus duration, then adds approved exam minutes and applicable extra time. Authorization, frozen rosters, overlap checks, revision checks, transactional replay and the preparation cutoff remain enforced.

## Test on the integrated local system

1. Sign in as a local school administrator. Approve a paper and wait for its package to be ready.
2. Choose Schedule a class sitting. Confirm preparation duration starts at 10. Select a future preparation time and sufficiently late results time.
3. Change duration to 25. The common start must be 25 minutes after preparation opens; the exam length must remain the approved length.
4. Select the confirmation checkbox, change duration again, and verify the checkbox clears. Values 0, 121, fractions and empty input must not save.
5. Save, reopen the sitting and choose Change this schedule. The saved duration must remain selected. Save a valid change and verify the student sees the corresponding preparation/start times in EAT.
6. Verify results cannot precede the latest accommodated deadline. Once preparation opens, schedule changes must be rejected.

## Automated evidence

Frontend ScheduleForm tests cover defaults, custom duration, reconfirmation, invalid values and clock cutoffs. Backend duration schema tests cover bounds and legacy requests. The disposable PostgreSQL operational test saves a 25-minute window, replays it, reschedules without the field, and verifies preserved duration, extra time and cutoff behavior. Run `node scripts/local-test.ts test` from the frontend repository for integrated checks; it targets the disposable local database only.
