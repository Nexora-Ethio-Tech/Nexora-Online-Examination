/** Exact non-issue messages from older prompts; unknown warnings remain visible. */
const informational = new Set([
  'topicnames array is empty; consider providing relevant topic names',
  'topicnames list is empty – suggested topics added',
  'no supplied topic names',
  'question is clear and key matches the correct answer',
  'no topicnames provided; suggested topics added',
  'topicnames array is empty',
]);

export function actionableReviewFlags(flags: string[]): string[] {
  return [...new Set(flags.map((flag) => flag.normalize('NFC').trim()))].filter(
    (flag) => !informational.has(flag.toLowerCase().replace(/[.!]+$/, '')),
  );
}
