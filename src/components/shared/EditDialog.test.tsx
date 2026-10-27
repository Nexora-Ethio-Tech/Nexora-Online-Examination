import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { EditDialog } from './EditDialog';
it('keeps unsaved edits on X until discard is explicit', async () => {
  const close = vi.fn();
  render(
    <EditDialog title="Edit student" close={close}>
      <label>
        Name
        <input defaultValue="Student" />
      </label>
    </EditDialog>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), ' updated');
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(close).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByRole('textbox')).toHaveValue('Student updated');
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Discard changes' }));
  expect(close).toHaveBeenCalledOnce();
});
it('retains the one-time credential view until acknowledged', async () => {
  const close = vi.fn();
  const { rerender } = render(
    <EditDialog title="Login details" close={close} locked protectChanges={false}>
      Private list
    </EditDialog>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  await user.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
  rerender(
    <EditDialog title="Login details" close={close} protectChanges={false}>
      Private list
    </EditDialog>,
  );
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(close).toHaveBeenCalledOnce();
});

it('cannot discard through an already-open confirmation while a save is unresolved', async () => {
  const close = vi.fn();
  const content = (
    <label>
      Name
      <input defaultValue="Student" />
    </label>
  );
  const { rerender } = render(
    <EditDialog title="Edit student" close={close}>
      {content}
    </EditDialog>,
  );
  const user = userEvent.setup();
  await user.type(screen.getByRole('textbox'), ' updated');
  await user.click(screen.getByRole('button', { name: 'Close' }));
  rerender(
    <EditDialog title="Edit student" close={close} locked>
      {content}
    </EditDialog>,
  );
  expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Discard changes' }));
  expect(close).not.toHaveBeenCalled();
});
