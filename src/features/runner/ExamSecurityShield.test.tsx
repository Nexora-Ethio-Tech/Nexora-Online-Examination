import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ExamSecurityShield } from './ExamSecurityShield';

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { loginId: 'S-STU-0001' }, school: { name: 'School' } } }),
}));
beforeEach(() => {
  Object.defineProperty(document.documentElement, 'requestFullscreen', {
    configurable: true,
    value: vi.fn().mockResolvedValue(undefined),
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('keeps questions unmounted when fullscreen is rejected', async () => {
  vi.spyOn(document.documentElement, 'requestFullscreen').mockRejectedValue(new Error('Denied'));
  render(
    <ExamSecurityShield
      engine={{ reportSecurityEvent: vi.fn() }}
      attemptId="attempt"
      examTitle="Exam"
    >
      <input aria-label="Answer" />
    </ExamSecurityShield>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start exam' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Fullscreen could not start');
  expect(screen.queryByLabelText('Answer')).not.toBeInTheDocument();
});

it('reports interruptions, preserves the answer through resume and locks at five episodes', async () => {
  vi.spyOn(document.documentElement, 'requestFullscreen').mockResolvedValue();
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  const report = vi.fn();
  const requestHelp = vi.fn().mockResolvedValue(undefined);
  const { unmount } = render(
    <ExamSecurityShield
      engine={{ reportSecurityEvent: report }}
      onRequestAssistance={requestHelp}
      attemptId="attempt"
      examTitle="Exam"
    >
      <input aria-label="Answer" defaultValue="Saved" />
    </ExamSecurityShield>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Start exam' }));
  await waitFor(() => expect(screen.getByLabelText('Answer')).toBeVisible());
  vi.useFakeTimers();
  for (let n = 1; n <= 5; n++) {
    fireEvent.blur(window);
    expect(screen.getByLabelText('Answer')).not.toBeVisible();
    expect(report).toHaveBeenCalledWith('window_blur', expect.any(String));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    if (n < 5) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Acknowledge & Resume Exam' }));
      });
      expect(screen.getByLabelText('Answer')).toHaveValue('Saved');
    }
  }
  expect(screen.getByRole('heading', { name: 'Exam Locked' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Resume/ })).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Request invigilator help' }));
  });
  expect(requestHelp).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: /Resume/ })).not.toBeInTheDocument();
  unmount();
  expect(document.documentElement).not.toHaveClass('nexora-screen-blackout');
});
