import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ScheduleCountdown } from './ScheduleCountdown';

afterEach(() => vi.restoreAllMocks());
it('uses the server sample and elapsed monotonic time rather than the device wall clock', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.spyOn(Date, 'now').mockReturnValue(0);
  const { rerender } = render(
    <ScheduleCountdown
      sample={{ epoch: Date.parse('2026-10-16T00:00:00Z'), receivedAt: 1000 }}
      target="2026-10-17T02:03:04Z"
      label="practice release"
    />,
  );
  expect(screen.getByText('1d 2h 3m 4s until practice release')).toBeInTheDocument();
  rerender(
    <ScheduleCountdown
      sample={{ epoch: Date.parse('2026-10-18T00:00:00Z'), receivedAt: 1000 }}
      target="2026-10-17T02:03:04Z"
      label="practice release"
    />,
  );
  expect(
    screen.getByText('practice release time reached. Refresh for the latest availability.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
