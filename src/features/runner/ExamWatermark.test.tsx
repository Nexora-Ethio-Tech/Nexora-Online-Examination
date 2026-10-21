import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ExamWatermark } from './ExamWatermark';
it('repeats only the attempt reference and an Ethiopian date and EAT timestamp without account details', () => {
  render(<ExamWatermark attemptId="attempt-reference" />);
  const watermark = screen.getByLabelText('Exam watermark');
  expect(watermark.querySelectorAll('p')).toHaveLength(2);
  expect(watermark.textContent).toMatch(
    /Nexora · attempt-reference · \d+ .+ \d{4} ዓ.ም. · \d+:\d{2} (AM|PM) EAT/,
  );
});
