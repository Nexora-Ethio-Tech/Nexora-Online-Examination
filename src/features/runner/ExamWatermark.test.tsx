import { render, screen, act } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ExamWatermark } from './ExamWatermark';
it('renders two candidate patterns and the EAT timestamp', () => {
  render(
    <ExamWatermark
      attemptId="attempt-reference"
      studentLoginId="TEST-STU-0001"
      schoolName="Eagle"
    />,
  );
  const watermark = screen.getByTestId('exam-watermark');
  expect(watermark.querySelectorAll('pattern')).toHaveLength(2);
  expect(watermark).toHaveTextContent('EAGLE TEST-STU-0001');
  expect(watermark).toHaveTextContent('EAT');
  expect(watermark).toHaveAttribute('aria-hidden', 'true');
});
it('moves every 15 seconds and clears its timer on unmount', () => {
  vi.useFakeTimers();
  try {
    const { unmount } = render(<ExamWatermark attemptId="private-attempt" />);
    const initial = screen.getByTestId('exam-watermark').style.transform;
    act(() => vi.advanceTimersByTime(15000));
    expect(screen.getByTestId('exam-watermark').style.transform).not.toBe(initial);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
