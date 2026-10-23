import type { ReactNode } from 'react';
import './privacy-shield.css';

/** A copying deterrent only; controls retain normal keyboard interaction. */
export function ExamQuestionSurface({
  attemptId,
  children,
}: {
  attemptId: string;
  children: ReactNode;
}) {
  return (
    <section
      data-attempt-id={attemptId}
      className="exam-question-surface nexora-surface space-y-4 rounded-xl border bg-background p-5 sm:p-6"
      onDragStart={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.exam-question-text') &&
          !event.target.closest('input, textarea, [contenteditable="true"]')
        )
          event.preventDefault();
      }}
    >
      {children}
    </section>
  );
}
