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
  expect(field.getByRole('combobox', { name: 'Day' })).toHaveValue('6');
  expect(field.getByRole('combobox', { name: 'AM / PM' })).toHaveValue('AM');
  fireEvent.change(field.getByRole('combobox', { name: 'Year' }), { target: { value: '2016' } });
  expect(field.getByRole('combobox', { name: 'Day' })).toHaveValue('5');
  expect(screen.getByLabelText('Wire value')).toHaveTextContent('2024-09-10T00:05');
  fireEvent.change(field.getByRole('combobox', { name: 'AM / PM' }), { target: { value: 'PM' } });
  expect(screen.getByLabelText('Wire value')).toHaveTextContent('2024-09-10T12:05');
});
it('keeps optional dates empty until explicitly selected and allows clearing', () => {
  render(<Form initial="" optional />);
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Wire value')).toBeEmptyDOMElement();
  fireEvent.click(screen.getByRole('button', { name: 'Choose date' }));
  expect(screen.getByRole('combobox', { name: 'Month' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear date' }));
  expect(screen.getByLabelText('Wire value')).toBeEmptyDOMElement();
});
it('disables all fields together and uses readable Amharic months', () => {
  render(<Form disabled />);
  for (const select of screen.getAllByRole('combobox')) expect(select).toBeDisabled();
  expect(screen.getByRole('option', { name: 'ጳጉሜ' })).toBeInTheDocument();
});
