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
import { PortalGuide } from '@/features/onboarding/PortalGuide';

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
        user.role === 'invigilator'
          ? 'Exam assistance'
          : user.role === 'student'
            ? 'My exams'
            : user.role === 'teacher'
              ? 'My exam papers'
              : 'Exam approvals',
      icon: LayoutDashboard,
      end: true,
    },
    ...(user.role !== 'invigilator'
      ? [{ to: `${roleHome[user.role]}/results`, label: 'Official results', icon: BarChart3 }]
      : []),
    ...(user.role !== 'student' && user.role !== 'invigilator'
      ? [{ to: `${roleHome[user.role]}/assistance`, label: 'Exam assistance', icon: LifeBuoy }]
      : []),
    ...(user.role !== 'teacher' && user.role !== 'invigilator'
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
    <nav aria-label="Workspace" className="space-y-1.5">
      {links.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={() => setMenuOpen(false)}
          className="flex min-h-12 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground"
        >
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
      {user.role === 'student' && (
        <div className="mt-6 border-t border-sidebar-border pt-4">
          <p className="px-4 text-xs font-medium text-sidebar-foreground">Help and devices</p>
          <NavLink
            to="/student/device"
            onClick={() => setMenuOpen(false)}
            className="mt-2 flex min-h-11 items-center gap-3 rounded-xl px-4 text-sm text-sidebar-foreground hover:bg-sidebar-accent/15 aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground"
          >
            <LifeBuoy className="size-4 shrink-0" aria-hidden="true" />
            Register replacement browser
          </NavLink>
        </div>
      )}
    </nav>
  );
  return (
    <div ref={container} className="workspace-shell min-h-svh">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-background focus:p-3 focus:text-foreground focus:ring-2"
      >
        Skip to main content
      </a>
      {!focused && (
        <header ref={header} className="sticky top-0 z-20 border-b bg-background px-4 sm:px-8">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button data-tour-navigation variant="outline" className="min-h-11 lg:hidden">
                    <Menu aria-hidden="true" />
                    <span className="sr-only">Navigation</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  data-tour-menu
                  style={{ transform: 'none', translate: 'none', animation: 'none' }}
                  side="left"
                  className="overflow-y-auto border-sidebar-border bg-sidebar p-4 text-sidebar-foreground"
                >
                  <SheetHeader>
                    <SheetTitle>Workspace navigation</SheetTitle>
                    <SheetDescription className="text-sidebar-foreground">
                      {school.name} · {roleLabel[user.role]}
                    </SheetDescription>
                  </SheetHeader>
                  {navigation}
                  <p className="mt-6 text-xs text-sidebar-foreground">
                    Exam schedules use East Africa Time (EAT).
                  </p>
                </SheetContent>
              </Sheet>
              <GraduationCap className="size-8 shrink-0" aria-hidden="true" />
              <div className="min-w-0 overflow-hidden">
                <p className="brand-heading truncate text-2xl font-semibold tracking-tight">
                  Nexora
                </p>
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
            : 'mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-8 lg:grid-cols-[240px_1fr] lg:gap-8'
        }
      >
        {!focused && (
          <aside className="hidden min-w-0 self-start rounded-2xl bg-sidebar p-3 text-sidebar-foreground lg:sticky lg:top-[calc(var(--workspace-header-height)+1rem)] lg:flex lg:max-h-[calc(100svh-var(--workspace-header-height)-2rem)] lg:min-h-[calc(100svh-var(--workspace-header-height)-4rem)] lg:flex-col lg:overflow-y-auto">
            <p className="mb-4 px-4 pt-4 text-xs font-semibold tracking-widest text-sidebar-foreground">
              {roleLabel[user.role].toUpperCase()}
            </p>
            {navigation}
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
            {!focused && (
              <PortalGuide
                key={`${school.id}:${user.id}:${user.role}`}
                schoolId={school.id}
                userId={user.id}
                role={user.role}
              />
            )}
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
