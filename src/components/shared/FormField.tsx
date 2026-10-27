import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

type ControlProps = {
  id: string;
  required: boolean;
  'aria-invalid': boolean;
  'aria-describedby': string | undefined;
};

type Props = {
  id: string;
  label: string;
  error?: string | undefined;
  required?: boolean;
  hint?: string | undefined;
  children: (control: ControlProps) => ReactNode;
};

export function FormField({ id, label, error, hint, required = false, children }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true" className="required-marker" /> : null}
      </Label>
      {children({ id, required, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-sm">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
