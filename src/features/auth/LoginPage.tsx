import { useState } from 'react';
import { Navigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, GraduationCap, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/shared/FormField';
import { useAuth } from './AuthProvider';
import { loginSchema, type LoginInput } from './schemas';
import { ApiError, errorMessage } from '@/lib/api-client';
import { authenticatedDestination } from './attempt-resume';

export function LoginPage() {
  const auth = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { loginId: '', password: '' },
  });
  if (auth.session) return <Navigate to={authenticatedDestination(auth.session)} replace />;
  if (auth.challenge) return <Navigate to="/mfa" replace />;

  async function submit(input: LoginInput) {
    setError(null);
    try {
      await auth.login.mutateAsync(input);
    } catch (failure) {
      setError(failure);
      if (failure instanceof ApiError)
        failure.details.forEach((detail) => {
          if (detail.path === 'loginId' || detail.path === 'password')
            form.setError(detail.path, { message: detail.message });
        });
    } finally {
      form.setValue('password', '');
      auth.login.reset();
    }
  }

  return (
    <div className="workspace-shell grid min-h-svh lg:grid-cols-[1fr_1.05fr]">
      <aside className="relative hidden flex-col justify-between bg-sidebar p-12 text-white lg:flex xl:p-16">
        <div className="flex items-center gap-3 text-xl font-semibold tracking-tight">
          <GraduationCap className="size-8" aria-hidden="true" /> Nexora
          <span className="text-xs font-normal tracking-widest text-sidebar-foreground">
            FOR SCHOOLS
          </span>
        </div>
        <div className="max-w-lg py-16">
          <p className="mb-6 text-xs font-medium tracking-[0.2em] text-sidebar-accent">
            A PLACE TO LEARN. ROOM TO GROW.
          </p>
          <h1 className="brand-heading text-5xl leading-[1.12] font-semibold tracking-tight xl:text-6xl">
            Every exam.
            <br />A step forward.
          </h1>
          <p className="mt-7 max-w-sm text-lg leading-relaxed text-sidebar-foreground">
            One place for your school’s exams, results and continued practice.
          </p>
          <div className="mt-12 flex gap-6 border-t border-sidebar-border pt-6 text-sm text-sidebar-foreground">
            <span>Prepare</span>
            <span aria-hidden="true">/</span>
            <span>Take your exam</span>
            <span aria-hidden="true">/</span>
            <span>Keep learning</span>
          </div>
        </div>
        <p className="text-xs text-sidebar-foreground">Nexora School Exam Platform</p>
      </aside>
      <main id="main-content" className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-12 flex items-center gap-2 text-xl font-semibold lg:hidden">
            <GraduationCap aria-hidden="true" /> Nexora
          </div>
          <p className="mb-3 text-xs font-semibold tracking-widest text-muted-foreground">
            YOUR SCHOOL WORKSPACE
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">Welcome back</h2>
          <p className="mt-3 mb-8 text-sm leading-relaxed text-muted-foreground">
            Sign in with the user ID and password provided by your school.
          </p>
          <form onSubmit={form.handleSubmit(submit)} noValidate className="grid gap-5">
            <FormField id="login-id" label="User ID" error={form.formState.errors.loginId?.message}>
              {(control) => (
                <Input
                  {...control}
                  {...form.register('loginId')}
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="e.g. SCH-001"
                  className="h-12"
                  disabled={form.formState.isSubmitting}
                />
              )}
            </FormField>
            <FormField
              id="password"
              label="Password"
              error={form.formState.errors.password?.message}
            >
              {(control) => (
                <div className="relative">
                  <Input
                    {...control}
                    {...form.register('password')}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="h-12 pr-12"
                    disabled={form.formState.isSubmitting}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="absolute top-0 right-0 size-12"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              )}
            </FormField>
            {error ? (
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {errorMessage(error)}
              </p>
            ) : null}
            <Button
              type="submit"
              className="h-12 w-full gap-2"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            Forgot your password? Ask your school administrator to reset it.
          </p>
          <a href="/platform" className="mt-3 inline-flex min-h-11 items-center text-sm underline">
            Platform owner sign-in
          </a>
          <div className="mt-12 flex items-start gap-2 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
            <p>Using a shared device? Sign out when you’re finished.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
