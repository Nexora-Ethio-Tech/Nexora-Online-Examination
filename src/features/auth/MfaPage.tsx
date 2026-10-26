import { useState } from 'react';
import { Navigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/FormField';
import { ApiError, errorMessage } from '@/lib/api-client';
import { useAuth } from './AuthProvider';
import { mfaSchema, type MfaInput } from './schemas';
import { roleHome } from './role-home';

export function MfaPage() {
  const auth = useAuth();
  const [error, setError] = useState<unknown>(null);
  const form = useForm<MfaInput>({ resolver: zodResolver(mfaSchema), defaultValues: { code: '' } });
  if (auth.session) return <Navigate to={roleHome[auth.session.user.role]} replace />;
  if (!auth.challenge) return <Navigate to="/login" replace />;
  const expired =
    error instanceof ApiError && (error.status === 401 || error.code === 'CSRF_INVALID');
  async function submit(input: MfaInput) {
    setError(null);
    try {
      await auth.verify.mutateAsync(input);
    } catch (failure) {
      setError(failure);
      if (failure instanceof ApiError)
        failure.details.forEach((detail) => {
          if (detail.path === 'code') form.setError('code', { message: detail.message });
        });
    } finally {
      form.setValue('code', '');
      auth.verify.reset();
    }
  }
  return (
    <main
      id="main-content"
      className="flex min-h-svh items-center justify-center bg-muted/30 px-6 py-12"
    >
      <div className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm sm:p-8">
        <ShieldCheck className="mb-6 size-9" aria-hidden="true" />
        <p className="mb-2 text-xs font-semibold tracking-widest text-muted-foreground">
          ACCOUNT VERIFICATION
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">One more step</h1>
        <p className="mt-3 mb-8 text-sm leading-relaxed text-muted-foreground">
          Enter the six-digit code from your authenticator app to open your workspace.
        </p>
        <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-5">
          <FormField
            id="mfa-code"
            label="Verification code"
            error={form.formState.errors.code?.message}
          >
            {(control) => (
              <Input
                {...control}
                {...form.register('code')}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="h-12 text-center text-xl tracking-[0.3em]"
                disabled={form.formState.isSubmitting || expired}
              />
            )}
          </FormField>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {expired
                ? 'Your verification session expired. Return to sign in.'
                : errorMessage(error)}
            </p>
          ) : null}
          <Button type="submit" className="h-12" disabled={form.formState.isSubmitting || expired}>
            {form.formState.isSubmitting ? 'Verifying…' : 'Verify and continue'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={auth.resetChallenge}
            disabled={form.formState.isSubmitting}
          >
            Back to sign in
          </Button>
        </form>
        <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
          Lost access to your authenticator? Contact your Nexora support contact.
        </p>
      </div>
    </main>
  );
}
