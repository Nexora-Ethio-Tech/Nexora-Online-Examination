import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from '@/components/shared/FormField';
import { Input } from '@/components/ui/input';

describe('FormField', () => {
  it('links the label, hint and error to the control', () => {
    render(
      <FormField id="email" label="Email" hint="Use your school address" error="Required">
        {(control) => <Input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'email-hint email-error');
    expect(screen.getByRole('alert')).toHaveTextContent('Required');
  });

  it('is valid and has no description when there is no hint or error', () => {
    render(
      <FormField id="name" label="Name">
        {(control) => <Input {...control} />}
      </FormField>,
    );
    const input = screen.getByLabelText('Name');
    expect(input).toHaveAttribute('aria-invalid', 'false');
    expect(input).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
