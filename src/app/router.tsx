import { lazy, useEffect } from 'react';
import { Navigate, Outlet, useLocation, createBrowserRouter, type RouteObject } from 'react-router';
import { isAttemptPath, rememberAttempt } from '@/features/auth/attempt-resume';
import { useAuth } from '@/features/auth/AuthProvider';
import { LoginPage } from '@/features/auth/LoginPage';
import { MfaPage } from '@/features/auth/MfaPage';
import { roleHome } from '@/features/auth/role-home';
import { RequireRole } from './RequireRole';

import { DashboardLayout } from './DashboardLayout';

import { ErrorState } from '@/components/shared/ErrorState';
import { errorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
const AssistancePage = lazy(() =>
  import('@/features/assistance/AssistancePage').then((module) => ({
    default: module.AssistancePage,
  })),
);

const AccommodationsPage = lazy(() =>
  import('@/features/exams/admin/AccommodationsPage').then((module) => ({
    default: module.AccommodationsPage,
  })),
);
const SchoolSetupPage = lazy(() =>
  import('@/features/school/SchoolSetupPage').then((module) => ({
    default: module.SchoolSetupPage,
  })),
);
const AdminExamsPage = lazy(() =>
  import('@/features/exams/admin/AdminExamsPage').then((module) => ({
    default: module.AdminExamsPage,
  })),
);
const AdminExamDetail = lazy(() =>
  import('@/features/exams/admin/AdminExamDetail').then((module) => ({
    default: module.AdminExamDetail,
  })),
);
const ExamsPage = lazy(() =>
  import('@/features/exams/ExamsPage').then((module) => ({ default: module.ExamsPage })),
);
const PreparationPage = lazy(() =>
  import('@/features/exams/PreparationPage').then((module) => ({
    default: module.PreparationPage,
  })),
);
const DevicePage = lazy(() =>
  import('@/features/exams/DevicePage').then((module) => ({ default: module.DevicePage })),
);
const MonitorPage = lazy(() =>
  import('@/features/exams/monitor/MonitorPages').then((module) => ({
    default: module.MonitorPage,
  })),
);
const MonitorSittingPage = lazy(() =>
  import('@/features/exams/monitor/MonitorPages').then((module) => ({
    default: module.MonitorSittingPage,
  })),
);
const MonitorAttemptPage = lazy(() =>
  import('@/features/exams/monitor/MonitorPages').then((module) => ({
    default: module.MonitorAttemptPage,
  })),
);
const RunnerPage = lazy(() =>
  import('@/features/runner/RunnerPage').then((module) => ({ default: module.RunnerPage })),
);
const TeacherPage = lazy(() =>
  import('@/features/exams/authoring/TeacherPage').then((module) => ({
    default: module.TeacherPage,
  })),
);
const TeacherDetail = lazy(() =>
  import('@/features/exams/authoring/TeacherDetail').then((module) => ({
    default: module.TeacherDetail,
  })),
);
const ResultsPage = lazy(() =>
  import('@/features/results/ResultsPage').then((module) => ({ default: module.ResultsPage })),
);
const ResultDetail = lazy(() =>
  import('@/features/results/ResultsPage').then((module) => ({ default: module.ResultDetail })),
);
const RecoveryPage = lazy(() =>
  import('@/features/exams/recovery/RecoveryPage').then((module) => ({
    default: module.RecoveryPage,
  })),
);
const RecoveryDetailPage = lazy(() =>
  import('@/features/exams/recovery/RecoveryPage').then((module) => ({
    default: module.RecoveryDetailPage,
  })),
);
const AdminPracticePage = lazy(() =>
  import('@/features/practice/PracticePages').then((module) => ({
    default: module.AdminPracticePage,
  })),
);
const PracticePage = lazy(() =>
  import('@/features/practice/PracticePages').then((module) => ({ default: module.PracticePage })),
);
const PracticeRunnerPage = lazy(() =>
  import('@/features/practice/PracticePages').then((module) => ({
    default: module.PracticeRunnerPage,
  })),
);

function RouteFailure() {
  return (
    <main className="mx-auto max-w-lg space-y-4 px-6 py-20">
      <h1 className="text-2xl font-semibold">This page couldn’t open</h1>
      <p role="alert">Reconnect, then reload this page. If it still fails, contact your school.</p>
      <p className="text-sm text-muted-foreground">
        Keep this browser and its site storage. Saved exam work has not been cleared. Reopening an
        exam requires online revalidation, and its original deadline still applies.
      </p>
      <Button className="min-h-11" onClick={() => window.location.reload()}>
        Reload this page
      </Button>
    </main>
  );
}
function SessionGate() {
  const auth = useAuth();
  const location = useLocation();
  const recovering = isAttemptPath(location.pathname);
  useEffect(() => {
    if (auth.session) rememberAttempt(auth.session, location.pathname);
  }, [auth.session, location.pathname]);
  if (auth.loading)
    return (
      <main className="flex min-h-svh items-center justify-center p-6">
        <p role="status" className="text-sm text-muted-foreground">
          Opening your workspace…
        </p>
      </main>
    );
  if (auth.sessionError && !auth.session)
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="mb-6 text-2xl font-semibold">
          {recovering ? 'Reconnect to recover your exam' : 'We couldn’t check your session'}
        </h1>
        {recovering && (
          <div className="mb-6 space-y-3 text-sm">
            <p>
              We cannot verify your session while the connection or server is unavailable. Editing
              is paused.
            </p>
            <p>
              Keep this browser open. Do not clear site storage or switch browsers. Any answers
              already saved on this device must be retained.
            </p>
            <p>
              Reconnect and try again. If asked to sign in, use the same student account. We must
              verify your identity, exam time and active browser before reopening. Your original
              deadline still applies.
            </p>
          </div>
        )}
        <ErrorState
          message={errorMessage(auth.sessionError)}
          onRetry={() => {
            void auth.retrySession();
          }}
        />
      </main>
    );
  return <Outlet />;
}
function Home() {
  const auth = useAuth();
  return (
    <Navigate
      to={auth.session ? roleHome[auth.session.user.role] : auth.challenge ? '/mfa' : '/login'}
      replace
    />
  );
}
function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-6 py-20">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="my-4 text-muted-foreground">
        This address does not lead to a school workspace.
      </p>
      <Button asChild className="min-h-11">
        <a href="/">Return to your workspace</a>
      </Button>
    </main>
  );
}
export const routes: RouteObject[] = [
  {
    element: <SessionGate />,
    errorElement: <RouteFailure />,
    children: [
      { index: true, element: <Home /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/mfa', element: <MfaPage /> },
      ...(['student', 'teacher', 'school_admin'] as const).map((role) => ({
        element: <RequireRole role={role} />,
        children: [
          {
            path: roleHome[role],
            element: <DashboardLayout />,
            children:
              role === 'student'
                ? [
                    { index: true, element: <ExamsPage /> },
                    { path: 'device', element: <DevicePage /> },
                    { path: 'results', element: <ResultsPage /> },
                    { path: 'practice', element: <PracticePage /> },
                    { path: 'practice/:practiceAttemptId', element: <PracticeRunnerPage /> },
                    { path: 'exams/:sessionId', element: <PreparationPage /> },
                    { path: 'attempts/:attemptId', element: <RunnerPage /> },
                  ]
                : role === 'teacher'
                  ? [
                      { index: true, element: <TeacherPage /> },
                      { path: 'assistance', element: <AssistancePage /> },
                      { path: 'results', element: <ResultsPage /> },
                      { path: 'results/:sessionId', element: <ResultDetail /> },
                      { path: 'exams/:examId', element: <TeacherDetail /> },
                    ]
                  : [
                      { index: true, element: <AdminExamsPage /> },
                      { path: 'assistance', element: <AssistancePage /> },
                      { path: 'monitor', element: <MonitorPage /> },
                      { path: 'monitor/attempts/:attemptId', element: <MonitorAttemptPage /> },
                      { path: 'monitor/:sessionId', element: <MonitorSittingPage /> },
                      { path: 'school', element: <SchoolSetupPage /> },
                      { path: 'practice', element: <AdminPracticePage /> },
                      { path: 'recovery', element: <RecoveryPage /> },
                      { path: 'recovery/:recoveryId', element: <RecoveryDetailPage /> },
                      { path: 'results', element: <ResultsPage /> },
                      { path: 'results/:sessionId', element: <ResultDetail /> },
                      { path: 'exams/:examId', element: <AdminExamDetail /> },
                      {
                        path: 'sessions/:sessionId/accommodations',
                        element: <AccommodationsPage />,
                      },
                    ],
          },
        ],
      })),
      { path: '*', element: <NotFound /> },
    ],
  },
];
export function createAppRouter() {
  return createBrowserRouter(routes);
}
