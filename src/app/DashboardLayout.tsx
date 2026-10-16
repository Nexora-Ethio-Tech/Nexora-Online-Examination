import { Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { GraduationCap, LayoutDashboard, LogOut, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { roleHome, roleLabel } from '@/features/auth/role-home';
import { errorMessage } from '@/lib/api-client';
import { useRoleTheme } from '@/lib/use-role-theme';

export function DashboardLayout() {
  const auth = useAuth();
  const [error, setError] = useState<unknown>(null);
  const container = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () =>
      container.current?.style.setProperty(
        '--workspace-header-height',
        `${element.getBoundingClientRect().height}px`,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useRoleTheme(auth.session?.user.role ?? 'student');
  if (!auth.session) return <Navigate to="/login" replace />;
  const { user, school } = auth.session;
  async function logout() {
    setError(null);
    try {
      await auth.logout.mutateAsync();
    } catch (failure) {
      setError(failure);
    }
  }
  return (
    <div ref={container} className="min-h-svh bg-muted/30">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-3 focus:text-foreground focus:ring-2"
      >
        Skip to main content
      </a>
      <header ref={header} className="sticky top-0 z-20 border-b bg-background px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <GraduationCap className="size-8 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight">Nexora</p>
              <p className="max-w-48 truncate text-xs text-muted-foreground sm:max-w-md">
                {school.name}
              </p>
            </div>
          </div>
          <Button asChild variant="outline" className="min-h-11">
            <a href="#workspace-navigation">
              <Menu aria-hidden="true" />
              Navigation
            </a>
          </Button>
          <Button
            variant="outline"
            className="min-h-11"
            disabled={auth.logout.isPending}
            onClick={() => void logout()}
          >
            <LogOut aria-hidden="true" />
            {auth.logout.isPending ? 'Signing out…' : 'Sign out'}
          </Button>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[200px_1fr] lg:gap-12 lg:py-10">
        <aside className="min-w-0 self-start lg:sticky lg:top-[calc(var(--workspace-header-height)+1rem)] lg:max-h-[calc(100svh-var(--workspace-header-height)-2rem)] lg:overflow-y-auto">
          <p className="mb-4 text-xs font-semibold tracking-widest text-muted-foreground">
            {roleLabel[user.role].toUpperCase()}
          </p>
          <nav
            id="workspace-navigation"
            tabIndex={-1}
            aria-label="Workspace"
            className="scroll-mt-[calc(var(--workspace-header-height)+1rem)] rounded-lg border bg-background p-2 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="px-4 py-2 text-sm font-semibold">Workspace navigation</p>
            {user.role === 'school_admin' && (
              <NavLink
                to="/admin/monitor"
                className="mb-2 flex min-h-11 items-center rounded-lg px-4 text-sm font-medium aria-[current=page]:bg-primary/10"
              >
                Live exams
              </NavLink>
            )}
            {user.role === 'student' && (
              <NavLink
                to="/student/device"
                className="mb-2 flex min-h-11 items-center rounded-lg px-4 text-sm font-medium aria-[current=page]:bg-primary/10"
              >
                Register replacement browser
              </NavLink>
            )}
            {user.role === 'school_admin' && (
              <NavLink
                to="/admin/school"
                className="mb-2 flex min-h-11 items-center rounded-lg px-4 text-sm font-medium aria-[current=page]:bg-primary/10"
              >
                School setup
              </NavLink>
            )}
            {user.role !== 'teacher' && (
              <NavLink
                to={`${roleHome[user.role]}/practice`}
                className="mb-2 flex min-h-11 items-center rounded-lg px-4 text-sm font-medium aria-[current=page]:bg-primary/10"
              >
                {user.role === 'student' ? 'Practice' : 'Practice release'}
              </NavLink>
            )}
            {user.role === 'school_admin' && (
              <NavLink
                to="/admin/recovery"
                className="mb-2 flex min-h-11 items-center rounded-lg px-4 text-sm font-medium aria-[current=page]:bg-primary/10"
              >
                Recovery review
              </NavLink>
            )}
            <NavLink
              to={`${roleHome[user.role]}/results`}
              className="mb-2 flex min-h-11 items-center rounded-lg px-4 text-sm font-medium aria-[current=page]:bg-primary/10"
            >
              Official results
            </NavLink>
            <NavLink
              to={roleHome[user.role]}
              end
              className="flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm font-medium text-primary aria-[current=page]:bg-primary/10"
            >
              <LayoutDashboard className="size-4" aria-hidden="true" />
              {user.role === 'student'
                ? 'My exams'
                : user.role === 'teacher'
                  ? 'My exam papers'
                  : 'Exam approvals'}
            </NavLink>
          </nav>
          <p className="mt-6 hidden text-xs leading-relaxed text-muted-foreground lg:block">
            Exam schedules are shown in East Africa Time (EAT).
          </p>
        </aside>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 scroll-mt-[calc(var(--workspace-header-height)+1rem)] wrap-anywhere"
        >
          {error ? (
            <div role="alert" className="mb-6 rounded-lg border border-destructive/30 p-4">
              <p className="text-sm text-destructive">{errorMessage(error)}</p>
              <Button
                variant="outline"
                className="mt-3 min-h-11"
                onClick={() => {
                  void auth.retrySession();
                  setError(null);
                }}
              >
                Refresh session
              </Button>
            </div>
          ) : null}
          <Suspense fallback={<p role="status">Opening this page…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
