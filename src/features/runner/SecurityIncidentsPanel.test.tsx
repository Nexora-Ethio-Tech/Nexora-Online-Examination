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
  expect(classifyIncident('pagehide')).toBe('switch');
  expect(classifyIncident('hidden')).toBe('switch');
  expect(classifyIncident('focus_lost')).toBe('switch');
  expect(classifyIncident('devtools')).toBe('inspection');
  expect(classifyIncident('returned')).toBe('other');
});
it('filters received incidents and presents factual counts without mutation controls', () => {
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
  expect(screen.queryByText(/recommended/i)).not.toBeInTheDocument();
  expect(screen.getAllByText('1 reports')).toHaveLength(2);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Delayed delivery only' }));
  expect(screen.getByText(/Showing 1 of 2 incidents/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /S-1.*attempt-a/ }));
  expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'S-2' } });
  expect(screen.getByText('No incidents match the current filters.')).toBeInTheDocument();
});
it('orders attempts by receipt time rather than event severity and retains dismissed evidence', () => {
  render(
    <SecurityIncidentsPanel
      incidents={[
        {
          id: 'old',
          attemptId: 'old-attempt',
          studentLoginId: 'OLD',
          kind: 'watermark_tamper',
          observedAt: '2026-10-23T09:00:00Z',
          receivedAt: '2026-10-23T09:01:00Z',
          deviceGeneration: 1,
        },
        {
          id: 'new',
          attemptId: 'new-attempt',
          studentLoginId: 'NEW',
          kind: 'returned',
          observedAt: '2026-10-23T08:00:00Z',
          receivedAt: '2026-10-23T09:02:00Z',
          deviceGeneration: 1,
          reviewStatus: 'dismissed',
        },
      ]}
    />,
  );
  const buttons = screen.getAllByRole('button', { expanded: false });
  expect(buttons[0]).toHaveTextContent('NEW');
  expect(buttons[1]).toHaveTextContent('OLD');
  fireEvent.click(buttons[0]!);
  expect(screen.getByText('dismissed')).toBeVisible();
  expect(screen.getByText(/School received:/)).toBeVisible();
  expect(
    screen.queryByText(/warning recommended|urgent proctor|risk score/i),
  ).not.toBeInTheDocument();
});
