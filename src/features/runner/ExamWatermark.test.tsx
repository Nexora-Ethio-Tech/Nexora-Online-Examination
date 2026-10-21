import { render, screen } from '@testing-library/react';
import { act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ExamWatermark } from './ExamWatermark';
it('repeats only the attempt reference and an Ethiopian date and EAT timestamp without account details', () => {
  render(<ExamWatermark attemptId="attempt-reference" />);
  const watermark = screen.getByLabelText('Exam watermark');
  expect(document.querySelector('svg[aria-hidden="true"] pattern')).toBeInTheDocument();
  expect(watermark.textContent).toMatch(
    /Nexora · attempt-reference · \d+ .+ \d{4} ዓ.ም. · \d+:\d{2} (AM|PM) EAT/,
  );
});
it('updates the timestamp without accumulating timers after unmount', () => {
  vi.useFakeTimers();
  try {
    const { unmount } = render(<ExamWatermark attemptId="private-attempt" />);
    const initial = screen.getByLabelText('Exam watermark').textContent;
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByLabelText('Exam watermark').textContent).not.toBe(initial);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
