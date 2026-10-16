# Mathematics demo exam and testing guide

Use `public/templates/nexora-math-20-demo.xlsx` to rehearse teacher review, administrator approval and scheduling, the student exam, monitoring, official reports and practice. It contains 20 original mathematics questions: 16 multiple choice and four true/false. Each question is worth two marks, for a total of 40. The four primary topics have five questions and ten marks each.

This is an additional bundled demo example. Upload the downloaded file unchanged. Do not edit and save it in Excel first: the demo recognizes the whole file by its fingerprint. Its questions, topic suggestions and explanations are supplied by matching fixture data, not a general parser or live AI. The two older examples still work. The API contract and exam rules have not changed.

## Start once and keep the same tab

Run `npm run dev:demo` in the `Nexora-Online-Examination` frontend checkout (the existing local folder may still be named `exam-frontend`). Load the updated app before beginning. Keep one browser tab open for the entire rehearsal. Use Sign out and Sign in to switch roles. Reloading the browser, opening a second tab or restarting the development server resets the in-memory demo and can break continuity with saved browser attempts.

| Role          | User ID      | Password    | MFA code     |
| ------------- | ------------ | ----------- | ------------ |
| Teacher       | DEMO-TEACHER | NexoraDemo! | Not required |
| Administrator | DEMO-ADMIN   | NexoraDemo! | 123456       |
| Student       | DEMO-STUDENT | NexoraDemo! | Not required |

These are public synthetic demo credentials. This linked exam flow uses Samira, the single seeded student in Grade 10 A. Adding directory accounts does not turn this simulator into a complete multi-student exam backend.

## 1 Teacher creates and reviews the exam

1. Sign in as the teacher and open **New exam**. Use the title **Mathematics demo 20 questions**, assignment **Grade 10 A / Mathematics**, English, **20 minutes**, **50% pass threshold**, and **Fixed order**. Use the instruction: “Choose one answer for each question. Each question is worth two marks.” Save the metadata.
2. Under **Import**, click **Download 20-question math demo (Excel)**. Upload that unchanged file. Wait for the job to finish. Expect **20 parsed**, **20 completed**, **20 questions**, **40 marks** and **0 reviewed**.
3. In **Review questions**, inspect each question, supplied key, topic and explanation. Check the review confirmation and click **Save question review** for each of the 20 questions. Merely selecting the checkbox does not save the review.
4. Question **M20-020** deliberately has one review flag. After checking it, enter the resolution note: **“Confirmed that a certain event has probability 1 and an impossible event has probability 0.”** Then check the confirmation and save.
5. Expect **20 reviewed**. **Submit for approval** should now be available. Submit; the teacher paper becomes read-only and appears in the administrator's review queue.

The expected scores below assume the supplied questions, answer keys, marks and topics are kept unchanged. You may edit them in the form to test corrections, but then calculate the expected scores from your edited version.

## 2 Administrator approves and schedules

Sign out, sign in as the administrator and complete MFA. Open the submitted paper, inspect its 20 questions and 40 total marks, and approve it. Wait for the package to be ready.

Schedule the sitting with a preparation time safely in the future, for example five minutes from now. Enter all schedule values in **East Africa Time (UTC+3)**. The app preserves the full ten-minute preparation period. A 20-minute exam therefore ends 30 minutes after preparation opens. For example, preparation at 15:00 EAT means common start at 15:10 and common end at 15:30. Set planned results to 15:31 or later in that example. Confirm the intended class and schedule.

Planned results time is not publication approval. Students will still need the separate publication step below. Open **Live monitoring** for this sitting; expect roster count **1**, initially **Not started: 1**. Generic home-page welcome cards are not result analytics; use **Live monitoring** and **Official results** for this paper's actual demo data.

## 3 Student prepares and takes the exam

Sign out and sign in as the student. Open **Mathematics demo 20 questions**, not the separate introductory Mathematics or English sample. Before preparation opens, seeing the schedule only is correct. At preparation time, refresh the schedule if needed and prepare/download the encrypted paper. It stays locked until the common start. Keep the tab open and online for unlock.

For a useful mixed-result test, use the **75% test answer** column below. There are 15 correct and five deliberately incorrect answers. Fixed order makes the question numbers match this table. With shuffled order, identify questions by their wording rather than their position or displayed option letter.

| No. | ID      | Question cue                    | Correct answer | 75% test answer                 |
| --- | ------- | ------------------------------- | -------------- | ------------------------------- |
| 1   | M20-001 | Solve 2x + 3 = 11               | B: 4           | B: 4                            |
| 2   | M20-002 | Simplify 3a + 2a - a            | C: 4a          | C: 4a                           |
| 3   | M20-003 | y = 2x - 1 at x = 3             | D: 5           | D: 5                            |
| 4   | M20-004 | Solutions of x^2 - 9 = 0        | A: -3 and 3    | A: -3 and 3                     |
| 5   | M20-005 | Square of a sum                 | False          | **True (deliberately wrong)**   |
| 6   | M20-006 | Area of 8 cm by 5 cm rectangle  | C: 40 cm^2     | C: 40 cm^2                      |
| 7   | M20-007 | Triangle with angles 50 and 60  | B: 70 degrees  | B: 70 degrees                   |
| 8   | M20-008 | Hypotenuse with sides 6 and 8   | D: 10 cm       | D: 10 cm                        |
| 9   | M20-009 | Circumference with radius 7     | A: 44 cm       | A: 44 cm                        |
| 10  | M20-010 | Square has four equal sides     | True           | **False (deliberately wrong)**  |
| 11  | M20-011 | 3/4 + 1/8                       | C: 7/8         | C: 7/8                          |
| 12  | M20-012 | 15 percent of 200               | B: 30          | B: 30                           |
| 13  | M20-013 | 2^3 x 2^2                       | D: 32          | D: 32                           |
| 14  | M20-014 | Smallest prime above 20         | A: 23          | A: 23                           |
| 15  | M20-015 | 0.25 equals 1/4                 | True           | **False (deliberately wrong)**  |
| 16  | M20-016 | Mean of 2, 4, 6, 8              | B: 5           | B: 5                            |
| 17  | M20-017 | Median of 1, 3, 5, 7, 20        | C: 5           | C: 5                            |
| 18  | M20-018 | Mode of 2, 3, 3, 4, 5           | A: 3           | A: 3                            |
| 19  | M20-019 | Die result greater than 4       | D: 1/3         | **A: 1/6 (deliberately wrong)** |
| 20  | M20-020 | Certain event has probability 0 | False          | **True (deliberately wrong)**   |

Check that question navigation reaches question 20, the timer counts down, and saves distinguish local device saving from confirmed server saving. Complete **Review and submit**, then **Confirm submission**. Wait for a submission receipt. A click without a receipt is not a completed submission.

After submission, switch to the administrator in the same tab. Live monitoring should show **Submitted: 1** and a receipt time. There should be no remaining active student for this sitting. Monitor contact and server-save times have different meanings; viewing the monitor must not create a new student save.

## 4 Verify official reports and release

As administrator, open **Official results** and this paper's report. For the mixed-answer test, expect:

| Result                                | Expected value                             |
| ------------------------------------- | ------------------------------------------ |
| Official mark                         | 30 / 40                                    |
| Percentage                            | 75%                                        |
| Pass status at a 50% threshold        | Pass                                       |
| Rank in the one-student demo roster   | 1                                          |
| Finalized students included in charts | 1                                          |
| Other statuses                        | 0                                          |
| Distribution                          | One student in 60–79%; zero in other bands |
| Algebra                               | 8 / 10, 80%                                |
| Geometry                              | 8 / 10, 80%                                |
| Number and proportion                 | 8 / 10, 80%                                |
| Statistics and probability            | 6 / 10, 60%                                |

Download the sitting CSV and inspect the print/report view. They must agree on 30, 40, 75 and rank 1 for Samira. The all-sittings export may contain other papers you created; identify this paper by its title.

Students must not see the official mark before release. After the common end **plus five seconds**, approve publication. Choose an EAT release time later than the final acceptance boundary, enter a reason and confirm. An arrived release time releases immediately after approval; a future release stays hidden until that time. If the time picker only accepts minutes, use the next minute after the end and wait for it.

Switch to the student and refresh **Official results** after release: expect **30/40, 75%, rank 1**. Switch to the teacher: the same report and charts should be visible for the assigned paper, with no administrator publication control.

## 5 Verify practice without changing the official mark

As administrator, open **Practice release** for this same paper. All related official submission windows must be closed and their results published and released. Enable practice with an arrived EAT release time, a reason and confirmation.

As student, open **Practice** and start an attempt. Each answer needs **Check answer**; inspect its feedback and explanation. A checked answer is locked for that practice attempt. Complete all 20 questions and click **Complete practice**.

Use the correct-answer column for a completed score of **40/40, 100%**. Start another practice attempt using the mixed-answer column and complete it for **30/40, 75%**. Expect **two completed practice attempts**, **best practice 100%**, and the separate official result still **30/40, 75%, rank 1**. Unfinished attempts must not change the best completed score. Once practice content is released, this paper cannot be reused for another official sitting; create a fresh paper for a new official test.

## Additional checks and boundaries

- For a separate all-correct official rehearsal, create a fresh draft and upload the same unchanged file: expect **40/40, 100%**, all topic charts at 100%, and the 80–100% distribution band containing one student.
- For a separate failed-score rehearsal, answer only the first nine correctly and leave the rest blank: expect **18/40, 45%, Fail** at a 50% threshold. A submitted blank answer earns zero; a missing/unresolved submission is a different status and must not be assigned a fabricated score.
- For recovery decisions and device replacement, use the separate procedures in [recovery-review.md](recovery-review.md) and [live-exam-monitoring.md](live-exam-monitoring.md). This exam file alone does not create those exceptional cases.
- This exercise does not establish real backend parsing, live AI, durable server data, multi-device synchronization, a full class ranking, actual phone/network behavior or capacity. School setup has its own guide in [school-setup.md](school-setup.md).

## Backend handoff

No endpoint or contract revision is introduced. BE-03 already requires importing arbitrary valid XLSX/DOCX files. The backend developer can use this workbook as an additional parser and grading test: 20 rows, 40 marks, all keys matching the table above. They must parse the uploaded rows normally, not copy the demo fingerprint allowlist. Topic/explanation enrichment must follow the existing AI and human-review requirements. Its exact four-topic breakdown is seeded demo data; reproducing these chart expectations on the real backend requires the teacher to confirm these same primary topics before approval.
