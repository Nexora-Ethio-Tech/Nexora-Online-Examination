import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { InterruptionRecord } from './InterruptionRecord';

it('distinguishes a device claim from delayed server receipt without alleging screenshot capture', () => {
  render(
    <ul>
      <InterruptionRecord
        event={{
          id: 'event',
          kind: 'focus_lost',
          deviceGeneration: 2,
          observedAt: '2026-10-17T06:00:00Z',
          receivedAt: '2026-10-17T06:05:00Z',
        }}
      />
    </ul>,
  );
  expect(screen.getByText('Exam window became inactive')).toBeInTheDocument();
  expect(screen.getByText(/Device-reported time:/)).toHaveTextContent('9:00:00 AM EAT');
  expect(screen.getByText(/School received report:/)).toHaveTextContent('9:05:00 AM EAT');
  expect(screen.queryByText(/screenshot taken/i)).not.toBeInTheDocument();
});
