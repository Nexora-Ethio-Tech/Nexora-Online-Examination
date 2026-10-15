import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ScheduleForm } from './AdminExamDetail';
import { adminDetailSchema, type Sitting } from './schemas';

afterEach(() => vi.restoreAllMocks());
const detail = {
  ...adminDetailSchema.parse({
    exam: {
      examId: 'e',
      revision: 1,
      title: 'Math',
      instructions: 'Choose',
      assignmentId: 'a',
      language: 'en',
      durationMinutes: 20,
      passPercent: 50,
      ordering: 'fixed',
      status: 'approved',
      totalMarks: 2,
      itemCount: 1,
      reviewedCount: 1,
      importId: null,
      returnComment: null,
    },
    teacherName: 'Teacher',
    subjectName: 'Math',
    className: 'Grade 10',
    approvedVersion: 1,
    packageState: 'ready',
    items: [],
    serverNow: '2026-10-15T20:59:00Z',
    packageError: null,
    sessions: [],
    history: [],
  }),
  clockReceivedAt: 0,
};

it('keeps EAT independent of the device clock and shows field-specific errors across midnight', () => {
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.spyOn(Date, 'now').mockReturnValue(0);
  const save = vi.fn();
  render(<ScheduleForm detail={detail} pending={false} onRefresh={vi.fn()} onSave={save} />);
  const prep = screen.getByLabelText('Preparation date and time (EAT)');
  expect(prep).toHaveValue('2026-10-16T00:01');
  fireEvent.change(prep, { target: { value: '2026-10-15T23:58' } });
  expect(prep).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText(/Preparation must be later/)).toBeInTheDocument();
  fireEvent.change(prep, { target: { value: '2026-10-16T00:01' } });
  fireEvent.change(screen.getByLabelText('Planned results date and time (EAT)'), {
    target: { value: '2026-10-16T00:20' },
  });
  expect(screen.getByText(/Planned results must be at or after/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm schedule' }));
  expect(save).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Planned results date and time (EAT)'), {
    target: { value: '2026-10-16T00:31' },
  });
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm schedule' }));
  expect(save).toHaveBeenCalledWith('2026-10-15T21:01:00.000Z', '2026-10-15T21:31:00.000Z', '');
});

it('blocks stale samples, preserves entered dates on refresh and closes rescheduling at preparation', () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const save = vi.fn(),
    refresh = vi.fn();
  const initial: Sitting = {
    sessionId: 's',
    examId: 'e',
    approvedVersion: 1,
    scheduleRevision: 1,
    preparationVisibleAt: '2026-10-15T21:01:00Z',
    startsAt: '2026-10-15T21:11:00Z',
    endsAt: '2026-10-15T21:31:00Z',
    resultsReleaseAt: '2026-10-15T22:00:00Z',
    rosterCount: 1,
    canReschedule: true,
  };
  const view = render(
    <ScheduleForm
      detail={detail}
      initial={initial}
      pending={false}
      onRefresh={refresh}
      onSave={save}
    />,
  );
  fireEvent.change(screen.getByLabelText('Preparation date and time (EAT)'), {
    target: { value: '2026-10-16T00:10' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  clock.mockReturnValue(60_001);
  view.rerender(
    <ScheduleForm
      detail={detail}
      initial={initial}
      pending={false}
      onRefresh={refresh}
      onSave={save}
    />,
  );
  expect(screen.getByRole('button', { name: 'Save schedule change' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh server time' }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(screen.getByRole('checkbox')).not.toBeChecked();
  expect(screen.getByLabelText('Preparation date and time (EAT)')).toHaveValue('2026-10-16T00:10');
  view.rerender(
    <ScheduleForm
      detail={{ ...detail, serverNow: '2026-10-15T21:01:00Z', clockReceivedAt: 60_001 }}
      initial={initial}
      pending={false}
      onRefresh={refresh}
      onSave={save}
    />,
  );
  expect(
    screen.getByText('Preparation has opened. This schedule can no longer be changed.'),
  ).toBeInTheDocument();
  expect(save).not.toHaveBeenCalled();
});
