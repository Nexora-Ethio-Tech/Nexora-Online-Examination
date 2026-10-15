import { useState } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router';
import { GraduationCap, LayoutDashboard, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { roleHome, roleLabel } from '@/features/auth/role-home';
import { errorMessage } from '@/lib/api-client';
import { useRoleTheme } from '@/lib/use-role-theme';

export function DashboardLayout() {
  const auth = useAuth();
  const [error, setError] = useState<unknown>(null);
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
    <div className="min-h-svh bg-muted/30">
      <header className="border-b bg-background px-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <GraduationCap className="size-8 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-lg font-semibold tracking-tight">Nexora</p>
              <p className="max-w-48 truncate text-xs text-muted-foreground sm:max-w-md">
                {school.name}
              </p>
            </div>
          </div>
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
        <aside>
          <p className="mb-4 text-xs font-semibold tracking-widest text-muted-foreground">
            {roleLabel[user.role].toUpperCase()}
          </p>
          <nav aria-label="Workspace">
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
        <main id="main-content" className="min-w-0">
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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
