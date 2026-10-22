const labels: Record<string, string> = {
  imports: 'Question file reading',
  ai: 'Question explanations',
  packages: 'Exam preparation',
  import_jobs: 'Question file reading',
  ai_question_jobs: 'Question explanations',
  package_jobs: 'Exam preparation',
  queued: 'Waiting',
  processing: 'In progress',
  running: 'In progress',
  completed: 'Completed',
  succeeded: 'Completed',
  failed: 'Needs attention',
  pending: 'Waiting',
  cancelled: 'Cancelled',
  retry_wait: 'Waiting to retry',
};
export function processingLabel(value: string) {
  return labels[value] ?? value.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());
}
