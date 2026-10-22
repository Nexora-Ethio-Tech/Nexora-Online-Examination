import { useState } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { EthiopianDateTimeField } from './EthiopianDateTimeField';

function Form({ initial = '2023-09-11T00:05', disabled = false, optional = false }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <EthiopianDateTimeField
        label="Exam time"
        value={value}
        onChange={setValue}
        disabled={disabled}
        optional={optional}
        dateOnly={optional}
      />
      <output aria-label="Wire value">{value}</output>
    </>
  );
}
it('clamps leap Pagume when changing year, and preserves midnight/noon semantics', () => {
  render(<Form />);
  const field = within(screen.getByRole('group', { name: 'Exam time' }));
  fireEvent.click(field.getByRole('button', { name: /Choose date/ }));
  expect(field.getByRole('button', { name: 'Day 6' })).toHaveAttribute('aria-pressed', 'true');
  expect(field.getByRole('combobox', { name: 'AM / PM' })).toHaveValue('AM');
  fireEvent.change(field.getByRole('spinbutton', { name: 'Year' }), { target: { value: '2016' } });
  fireEvent.blur(field.getByRole('spinbutton', { name: 'Year' }));
  expect(field.getByRole('button', { name: 'Day 5' })).toHaveAttribute('aria-pressed', 'true');
  expect(field.queryByRole('button', { name: 'Day 6' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Wire value')).toHaveTextContent('2024-09-10T00:05');
  fireEvent.change(field.getByRole('combobox', { name: 'AM / PM' }), { target: { value: 'PM' } });
  expect(screen.getByLabelText('Wire value')).toHaveTextContent('2024-09-10T12:05');
});
it('keeps optional dates empty until explicitly selected and allows clearing', () => {
  render(<Form initial="" optional />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Wire value')).toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));
  fireEvent.click(screen.getByRole('button', { name: /Choose date/ }));
  expect(screen.getByRole('combobox', { name: 'Month' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));
  expect(screen.getByLabelText('Wire value')).toBeEmptyDOMElement();
});
it('disables all fields together and uses readable Amharic months', () => {
  render(<Form disabled />);
  for (const select of screen.getAllByRole('combobox')) expect(select).toBeDisabled();
  expect(screen.getByRole('button', { name: /Choose date/ })).toBeDisabled();
});

it('switches calendars without changing the selected instant and starts weeks on Monday', () => {
  render(<Form initial="2026-10-22T15:05" />);
  fireEvent.click(screen.getByRole('button', { name: 'Gregorian' }));
  expect(screen.getByLabelText('Wire value')).toHaveTextContent('2026-10-22T15:05');
  fireEvent.click(screen.getByRole('button', { name: /Choose date/ }));
  expect(screen.getByText('Mon')).toBeVisible();
  expect(screen.getByText('Sun')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Day 23' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ethiopian' }));
  expect(screen.getByLabelText('Wire value')).toHaveTextContent('2026-10-23T15:05');
});
