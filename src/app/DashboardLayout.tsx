import { Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router';
import {
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  BarChart3,
  BookOpen,
  Radio,
  School,
  LifeBuoy,
  UserCircle,
} from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/AuthProvider';
import { roleHome, roleLabel } from '@/features/auth/role-home';
import { errorMessage } from '@/lib/api-client';
import { useRoleTheme } from '@/lib/use-role-theme';

export function DashboardLayout() {
  const auth = useAuth();
  const location = useLocation();
  const focused = /^\/student\/attempts\/[^/]+\/?$/.test(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
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
  }, [focused]);
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
  const links = [
    {
      to: roleHome[user.role],
      label:
        user.role === 'student'
          ? 'My exams'
          : user.role === 'teacher'
            ? 'My exam papers'
            : 'Exam approvals',
      icon: LayoutDashboard,
      end: true,
    },
    { to: `${roleHome[user.role]}/results`, label: 'Official results', icon: BarChart3 },
    ...(user.role !== 'teacher'
      ? [
          {
            to: `${roleHome[user.role]}/practice`,
            label: user.role === 'student' ? 'Practice' : 'Practice release',
            icon: BookOpen,
          },
        ]
      : []),
    ...(user.role === 'school_admin'
      ? [
          { to: '/admin/monitor', label: 'Live exams', icon: Radio },
          { to: '/admin/recovery', label: 'Recovery review', icon: LifeBuoy },
          { to: '/admin/school', label: 'School setup', icon: School },
        ]
      : []),
  ];
  const navigation = (
    <nav aria-label="Workspace" className="space-y-1">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMenuOpen(false)}
          className="flex min-h-11 items-center gap-3 rounded-lg border-l-4 border-transparent px-3 py-2 text-sm font-medium hover:bg-muted aria-[current=page]:border-primary aria-[current=page]:bg-primary/10 aria-[current=page]:text-primary"
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
      {user.role === 'student' && (
        <div className="mt-6 border-t pt-4">
          <p className="px-4 text-xs font-medium text-muted-foreground">Help and devices</p>
          <NavLink
            to="/student/device"
            onClick={() => setMenuOpen(false)}
            className="mt-2 flex min-h-11 items-center gap-3 rounded-lg px-4 text-sm hover:bg-muted aria-[current=page]:bg-primary/10"
          >
            <LifeBuoy className="size-4 shrink-0" aria-hidden="true" />
            Register replacement browser
          </NavLink>
        </div>
      )}
    </nav>
  );
  return (
    <div ref={container} className="min-h-svh bg-muted/30">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-3 focus:text-foreground focus:ring-2"
      >
        Skip to main content
      </a>
      {!focused && (
        <header ref={header} className="sticky top-0 z-20 border-b bg-background px-4 sm:px-8">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="min-h-11 lg:hidden">
                    <Menu aria-hidden="true" />
                    <span className="sr-only">Navigation</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="overflow-y-auto p-4">
                  <SheetHeader>
                    <SheetTitle>Workspace navigation</SheetTitle>
                    <SheetDescription>
                      {school.name} · {roleLabel[user.role]}
                    </SheetDescription>
                  </SheetHeader>
                  {navigation}
                  <p className="mt-6 text-xs text-muted-foreground">
                    Exam schedules use East Africa Time (EAT).
                  </p>
                </SheetContent>
              </Sheet>
              <GraduationCap className="size-8 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-lg font-semibold tracking-tight">Nexora</p>
                <p className="max-w-32 truncate text-xs text-muted-foreground sm:max-w-md">
                  {school.name}
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="min-h-11" aria-label="Open account menu">
                  <UserCircle aria-hidden="true" />
                  <span className="hidden max-w-48 truncate sm:inline">{user.displayName}</span>
                  <span className="sm:hidden">Account</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-w-80">
                <DropdownMenuLabel>
                  <p>{user.displayName}</p>
                  <p className="text-xs font-normal">
                    {roleLabel[user.role]} · {school.name}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={auth.logout.isPending} onSelect={() => void logout()}>
                  <LogOut aria-hidden="true" />
                  {auth.logout.isPending ? 'Signing out…' : 'Sign out'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
      )}
      <div
        className={
          focused
            ? 'mx-auto max-w-4xl px-4 py-6 sm:px-8'
            : 'mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[224px_1fr] lg:gap-8'
        }
      >
        {!focused && (
          <aside className="hidden min-w-0 self-start lg:sticky lg:top-[calc(var(--workspace-header-height)+1rem)] lg:block lg:max-h-[calc(100svh-var(--workspace-header-height)-2rem)] lg:overflow-y-auto">
            <p className="mb-4 px-4 text-xs font-semibold tracking-widest text-muted-foreground">
              {roleLabel[user.role].toUpperCase()}
            </p>
            {navigation}
            <p className="mt-6 px-4 text-xs leading-relaxed text-muted-foreground">
              Exam schedules are shown in East Africa Time (EAT).
            </p>
          </aside>
        )}
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
