import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { RefreshControl } from './RefreshControl';

it('announces unchanged successful responses and failed refreshes without claiming stale data is fresh', async () => {
  const user = userEvent.setup();
  const refresh = vi
    .fn()
    .mockResolvedValueOnce({ error: null })
    .mockResolvedValueOnce({ error: new Error('offline') });
  render(
    <RefreshControl
      label="Refresh results"
      busy={false}
      updatedAt={Date.parse('2026-10-16T08:00:00Z')}
      refresh={refresh}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Refresh results' }));
  expect(screen.getByRole('status')).toHaveTextContent('Updated successfully');
  await user.click(screen.getByRole('button', { name: 'Refresh results' }));
  expect(screen.getByRole('status')).toHaveTextContent('Refresh failed');
  expect(screen.getByText(/Last successful update:/)).toHaveTextContent('11:00:00 EAT');
});

it('refreshes an embedded directory without submitting its surrounding form', async () => {
  const user = userEvent.setup();
  const submit = vi.fn();
  const refresh = vi.fn().mockResolvedValue({ error: null });
  render(
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <RefreshControl label="Refresh directory" busy={false} updatedAt={0} refresh={refresh} />
    </form>,
  );
  await user.click(screen.getByRole('button', { name: 'Refresh directory' }));
  expect(refresh).toHaveBeenCalledOnce();
  expect(submit).not.toHaveBeenCalled();
});
