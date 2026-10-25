# Nexora: exam content and question shuffling task brief

## What we want to achieve

Teachers must be able to prepare a complete exam with instructions, passages, questions, images and tables. Students must see the right instructions and reference material for every question. Shuffling must keep questions inside their correct section and must never separate a question from its passage.

Build the following five improvements into the existing portal. Keep the current visual style and the features that already work.

## 1. Let teachers complete and improve an exam during review

After uploading an exam, the teacher should be able to correct it and add anything missing without having to upload the whole file again.

The teacher must be able to:

- Add a new question, edit an existing question or remove a question.
- Change the order of questions.
- Add or edit instructions and additional explanatory text.
- Add a passage and select the questions that refer to it.
- Upload an image and place it with a question, passage or instruction.
- Add an image caption when needed.
- Create a table, enter its contents, and add or remove rows and columns.
- Edit or replace images and tables.
- Preview how the finished content will appear to students.

Keep the existing one-question-at-a-time review experience. Teachers should still have Previous, Next, Save and next, and numbered buttons for moving between questions. Reviewed questions should remain easy to identify, and questions needing attention should be clearly marked.

Do not lose unsaved changes when the teacher moves to another question. Moving to the next question must not automatically mark the previous question as reviewed.

**Example:** A biology question was imported without its diagram. The teacher opens that question, adds the diagram, checks the preview and saves it. They do not need to upload the exam again.

## 2. Organize the exam into sections with their own instructions

The teacher should see a clear outline of the exam and be able to organize it into sections.

Each section should have:

- A title, such as “Part A — Multiple choice”.
- Its own instructions.
- The questions belonging to that section.
- A passage, image or table where several questions need the same reference material.

The teacher must be able to create, rename and reorder sections, and move questions into the appropriate section. Multiple-choice and true/false questions should be placed in separate sections.

When several questions use one passage, the teacher should link them to that passage as a group. The passage should not be treated as a question or given marks.

If a teacher removes a section or passage that still has questions, ask what should happen to those questions. Let the teacher move them, remove them from the draft or cancel. Never silently remove or disconnect them.

**Example exam:**

| Section | Instructions | Content |
| --- | --- | --- |
| Part A — Multiple choice | Choose one correct answer. | Five independent questions |
| Part B — Reading | Read the passage and choose the correct answer. | One passage with four related questions |
| Part C — True or false | Decide whether each statement is true or false. | Six statements |

General instructions for the whole exam should remain separate from the instructions for each section.

## 3. Shuffle questions only inside their correct section

Shuffling must respect the exam's organization. Here, “section” means the group of questions under a particular set of instructions—not just questions about a similar topic.

Apply these rules:

1. Keep sections and their instructions in the order chosen by the teacher.
2. Let the teacher choose whether questions within a section stay in order or are shuffled.
3. Never move a question into another section during shuffling.
4. Never mix multiple-choice questions with true/false questions.
5. Keep each passage together with all its related questions.
6. Keep passage groups in their original places. Other questions may shuffle around the available standalone-question places.
7. Keep questions within a passage in order by default. Let the teacher explicitly choose to shuffle only those related questions if appropriate.
8. Make answer-choice shuffling a separate choice. Keep answer choices in order by default, and always keep true/false choices in their normal order.
9. Once a student begins an attempt, their order must stay the same when they return, refresh or resume after assistance.

Two sections may both contain multiple-choice questions but have different instructions. Their questions must still remain separate.

**Example:** Part A contains questions A1, A2 and A3. Part B contains questions B1, B2 and B3. A student may receive A3, A1, A2 followed by B2, B3, B1. They must never receive A3, B2, A1 under Part A's instructions.

If a question depends on a particular order—for example, “Use your answer to the previous question”—the teacher must be able to keep that group in order. Shuffling must not make the question meaningless.

The correct answers and marks must remain correct regardless of the order shown to each student.

## 4. Show the relevant passage with every related question

Students should not have to return to an earlier question to find the passage, image or table they need.

Whenever a student opens a question linked to a passage:

- Show the correct passage and its images or tables with that question.
- Show the relevant section instructions.
- On a large screen, place the passage beside the question when there is enough space.
- On a phone or small screen, place the passage above the question, with a clear way to expand or collapse it.
- When the student moves to another question using the same passage, keep that passage available.
- When the student moves to a different passage, show the new one.
- When the student opens a question without a passage, do not leave an unrelated passage on screen.

Images must be readable, and wide tables must be easy to view without making the whole page difficult to use. Students must still be able to select answers and move between questions comfortably.

Passages, images and tables must remain available during the exam after the student has downloaded the complete exam, including when their internet connection drops under the portal's existing offline rules.

When the exam is hidden or paused for staff assistance, hide the passage and question together. Resuming must preserve the student's saved answers and original exam deadline.

**Example:** Questions 6, 7, 8 and 9 use the same reading passage. Opening any of those questions must also show that passage. Opening question 10 from another section must show its own instructions instead.

## 5. Preserve instructions and reference material when importing

An uploaded exam should retain its organization as accurately as possible. Importing must handle questions, section headings, instructions, passages, images and tables where the supported file format allows it.

After import, the teacher should see:

- The sections and instructions that were found.
- The questions placed under each section.
- The passages and their related questions.
- The images and tables that were imported.
- Clear notices identifying anything missing, uncertain or needing correction.

If the system is unsure which questions belong to a passage, let the teacher choose. Do not silently guess and present the association as confirmed.

If an image or table cannot be imported, explain what is missing and let the teacher add it during review. Do not silently discard it and say the exam is complete.

If AI assistance fails, keep the content that was successfully read. The teacher should still be able to review and correct it. Preserve the existing cancel and retry functions.

Provide a downloadable example exam and simple upload instructions showing how to arrange sections, passages and questions. Clearly explain which file formats can include images and tables and which require the teacher to add those afterward.

**Example:** The uploaded document says “Read the following passage and answer questions 1–4.” The review page should show the passage with those four questions underneath it. If the association is unclear, the teacher should be asked to confirm it before the exam is finalized.

## How the complete process should work

1. The teacher uploads an exam or starts preparing one.
2. The portal shows the exam's sections, instructions, passages and questions.
3. The teacher corrects the organization and adds any missing questions, images or tables.
4. The teacher chooses which question groups may be shuffled.
5. The teacher previews the student experience and saves the completed exam.
6. The administrator reviews the complete exam, including all reference material, and follows the existing approval and scheduling process.
7. The student downloads the complete exam and answers questions with the correct instructions and passages visible.
8. The student's question order stays consistent, and marking remains accurate.

## Existing behavior that must be preserved

- Existing exams must continue to work.
- Editing an already approved exam must create a new version for approval. It must not change an exam students have already downloaded or started.
- Student copies must not reveal answer keys, private teacher notes or explanations that are not yet released.
- Saved answers, exam timing, staff assistance and result calculations must continue to work correctly.
- The new screens must work comfortably on phones as well as computers.
- Update the website tour and user guidance to explain the new controls.

## What to demonstrate before calling the work complete

Use a sample exam containing multiple-choice questions, true/false questions, two different passages, an image and a table. Demonstrate that:

- A teacher can add, edit, remove and reorder content during review.
- Each question appears under the right instructions.
- Shuffling never mixes sections or question types.
- Passage questions stay together and always show the right passage.
- Refreshing or resuming does not change a student's question order.
- Images and tables remain available after downloading the complete exam.
- Missing or uncertain imported content is clearly identified and can be corrected.
- The teacher and student screens work on a small phone screen.
- Correct answers receive the same marks regardless of question order.
- Existing exams and students' saved work are unaffected.

## Working arrangement

Use a separate feature branch based on the latest version supplied by the project owner. Do not start from an older copy of the portal. Keep changes focused on these five improvements.

Return the completed work for review with a short explanation of what changed, how the owner can test it, and any unfinished items. Do not change the live school system or deploy the work until the owner has reviewed and approved it.

This brief explains the required user experience. The separate technical handoff can be used when implementation details are needed.
