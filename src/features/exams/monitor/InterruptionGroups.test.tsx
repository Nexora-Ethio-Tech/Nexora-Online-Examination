import { render, screen, fireEvent } from '@testing-library/react';
import { expect, it } from 'vitest';
import { InterruptionGroups } from './InterruptionGroups';
it('organizes every event into four collapsed categories without losing source details', () => {
  const kinds = [
    'hidden',
    'returned',
    'pagehide',
    'fullscreen_exit',
    'focus_lost',
    'screenshot_attempt',
    'window_blur',
    'watermark_tamper',
  ] as const;
  render(
    <InterruptionGroups
      events={kinds.map((kind, index) => ({
        id: String(index),
        kind,
        deviceGeneration: 1,
        observedAt: '2026-10-23T08:00:00Z',
        receivedAt: '2026-10-23T08:05:00Z',
      }))}
    />,
  );
  expect(screen.getByText('Window and tab changes · 4')).toBeVisible();
  expect(screen.getByText('Screen protection · 2')).toBeVisible();
  expect(screen.getByText('Watermark integrity · 1')).toBeVisible();
  expect(screen.getByText('Returns to the exam · 1')).toBeVisible();
  fireEvent.click(screen.getByText('Returns to the exam · 1'));
  expect(screen.getByText('Exam tab visible again')).toBeVisible();
  expect(screen.getAllByText(/School received report:/)).toHaveLength(8);
});
