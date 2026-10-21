import { fireEvent, screen, within } from '@testing-library/react';
import { toEC } from 'kenat';

/** Interact with visible controls; keep fixture instants readable in existing scheduling tests. */
export function selectEatDateTime(label: string, wall: string) {
  const [year = 0, month = 0, day = 0] = wall.slice(0, 10).split('-').map(Number);
  const eth = toEC(year, month, day);
  const [hour = 0, minute = 0] = wall.slice(11).split(':').map(Number);
  const field = within(screen.getByRole('group', { name: label }));
  for (const [name, value] of [
    ['Day', 1],
    ['Year', eth.year],
    ['Month', eth.month],
    ['Day', eth.day],
    ['Hour', hour % 12 || 12],
    ['Minute', minute],
    ['AM / PM', hour >= 12 ? 'PM' : 'AM'],
  ] as const)
    fireEvent.change(field.getByRole('combobox', { name }), {
      target: { value: String(value) },
    });
}
