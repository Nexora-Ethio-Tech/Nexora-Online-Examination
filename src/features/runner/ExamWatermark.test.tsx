import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ExamWatermark } from './ExamWatermark';
it('repeats only the attempt reference and a UTC timestamp without account details', () => {
  render(<ExamWatermark attemptId="attempt-reference" />);
  const watermark = screen.getByLabelText('Exam watermark');
  expect(watermark.querySelectorAll('p')).toHaveLength(2);
  expect(watermark.textContent).toMatch(/Nexora · attempt-reference · \d{4}-\d{2}-\d{2}T/);
});
