import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExamPrivacyShield } from './ExamPrivacyShield';

beforeEach(() => vi.spyOn(document, 'hasFocus').mockReturnValue(true));
afterEach(() => vi.restoreAllMocks());

it('conceals synchronously on blur and requires a deliberate resume without remounting answers', () => {
  render(
    <ExamPrivacyShield>
      <label>
        Answer
        <input defaultValue="Saved choice" />
      </label>
    </ExamPrivacyShield>,
  );
  const answer = screen.getByLabelText('Answer');
  answer.focus();
  fireEvent.blur(window);
  expect(answer).not.toBeVisible();
  fireEvent.focus(window);
  expect(answer).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Resume exam' }));
  expect(answer).toBeVisible();
  expect(answer).toHaveValue('Saved choice');
  expect(answer).toHaveFocus();
});

it('does not expose questions while the page remains hidden', () => {
  render(
    <ExamPrivacyShield>
      <p>Question text</p>
    </ExamPrivacyShield>,
  );
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fireEvent(document, new Event('visibilitychange'));
  fireEvent.click(screen.getByRole('button', { name: 'Resume exam' }));
  expect(screen.getByText('Question text')).not.toBeVisible();
});

it('starts covered in an unfocused window and covers before print', () => {
  vi.mocked(document.hasFocus).mockReturnValue(false);
  render(
    <ExamPrivacyShield>
      <p>Question text</p>
    </ExamPrivacyShield>,
  );
  expect(screen.getByText('Question text')).not.toBeVisible();
  vi.mocked(document.hasFocus).mockReturnValue(true);
  fireEvent.click(screen.getByRole('button', { name: 'Resume exam' }));
  fireEvent(window, new Event('beforeprint'));
  expect(screen.getByText('Question text')).not.toBeVisible();
});

it('removes event handlers when the attempt screen unmounts', () => {
  const remove = vi.spyOn(window, 'removeEventListener');
  const { unmount } = render(
    <ExamPrivacyShield>
      <p>Question</p>
    </ExamPrivacyShield>,
  );
  unmount();
  expect(remove).toHaveBeenCalledWith('blur', expect.any(Function));
  expect(remove).toHaveBeenCalledWith('beforeprint', expect.any(Function));
});
