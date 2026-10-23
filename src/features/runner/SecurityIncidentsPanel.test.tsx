import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import {
  SecurityIncidentsPanel,
  classifyIncident,
  type IncidentRecord,
} from './SecurityIncidentsPanel';

it('classifies new reports without discarding legacy event kinds', () => {
  expect(classifyIncident('screenshot_attempt')).toBe('capture');
  expect(classifyIncident('watermark_tamper')).toBe('tamper');
  expect(classifyIncident('window_blur')).toBe('switch');
  expect(classifyIncident('fullscreen_exit')).toBe('fullscreen');
  expect(classifyIncident('pagehide')).toBe('other');
});
it('filters received incidents and presents recommendations without mutation controls', () => {
  const incidents: IncidentRecord[] = [
    {
      id: 'one',
      attemptId: 'attempt-a',
      studentLoginId: 'S-1',
      kind: 'watermark_tamper',
      observedAt: '2026-10-23T09:00:00Z',
      receivedAt: '2026-10-23T09:05:00Z',
      deviceGeneration: 1,
    },
    {
      id: 'two',
      attemptId: 'attempt-b',
      studentLoginId: 'S-2',
      kind: 'window_blur',
      observedAt: '2026-10-23T09:00:00Z',
      receivedAt: '2026-10-23T09:00:01Z',
      deviceGeneration: 1,
    },
  ];
  render(<SecurityIncidentsPanel incidents={incidents} />);
  expect(screen.getByText('Urgent proctor review recommended')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delayed delivery only' }));
  expect(screen.getByText(/Showing 1 of 2 incidents/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /S-1.*attempt-a/ }));
  expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'S-2' } });
  expect(screen.getByText('No incidents match the current filters.')).toBeInTheDocument();
});
