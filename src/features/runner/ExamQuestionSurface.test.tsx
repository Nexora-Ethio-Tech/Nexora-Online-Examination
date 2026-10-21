import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ExamQuestionSurface } from './ExamQuestionSurface';

it('discourages dragging question text while preserving answer inputs and keyboard access', () => {
  render(
    <ExamQuestionSurface attemptId="attempt">
      <p className="exam-question-text">Question text</p>
      <label className="exam-question-text">
        Answer
        <input />
      </label>
      <button>Next question</button>
    </ExamQuestionSurface>,
  );
  expect(fireEvent.dragStart(screen.getByText('Question text'))).toBe(false);
  const input = screen.getByRole('textbox');
  expect(fireEvent.dragStart(input)).toBe(true);
  fireEvent.change(input, { target: { value: 'My answer' } });
  expect(input).toHaveValue('My answer');
  input.focus();
  expect(input).toHaveFocus();
  expect(screen.getByRole('button', { name: 'Next question' })).toBeEnabled();
});
