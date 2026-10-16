import { AccommodationsPage } from '@/features/exams/admin/AccommodationsPage';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, createBrowserRouter, type RouteObject } from 'react-router';
import { isAttemptPath, rememberAttempt } from '@/features/auth/attempt-resume';
import { useAuth } from '@/features/auth/AuthProvider';
import { LoginPage } from '@/features/auth/LoginPage';
import { MfaPage } from '@/features/auth/MfaPage';
import { roleHome } from '@/features/auth/role-home';
import { RequireRole } from './RequireRole';
import { SchoolSetupPage } from '@/features/school/SchoolSetupPage';
import { DashboardLayout } from './DashboardLayout';
import { AdminExamsPage } from '@/features/exams/admin/AdminExamsPage';
import { AdminExamDetail } from '@/features/exams/admin/AdminExamDetail';
import { ErrorState } from '@/components/shared/ErrorState';
import { errorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { ExamsPage } from '@/features/exams/ExamsPage';
import { PreparationPage } from '@/features/exams/PreparationPage';
import { DevicePage } from '@/features/exams/DevicePage';
import {
  MonitorPage,
  MonitorSittingPage,
  MonitorAttemptPage,
} from '@/features/exams/monitor/MonitorPages';
import { RunnerPage } from '@/features/runner/RunnerPage';
import { TeacherPage } from '@/features/exams/authoring/TeacherPage';
import { TeacherDetail } from '@/features/exams/authoring/TeacherDetail';
import { ResultsPage, ResultDetail } from '@/features/results/ResultsPage';
import { RecoveryPage, RecoveryDetailPage } from '@/features/exams/recovery/RecoveryPage';
import {
  AdminPracticePage,
  PracticePage,
  PracticeRunnerPage,
} from '@/features/practice/PracticePages';

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
                      { path: 'results', element: <ResultsPage /> },
                      { path: 'results/:sessionId', element: <ResultDetail /> },
                      { path: 'exams/:examId', element: <TeacherDetail /> },
                    ]
                  : [
                      { index: true, element: <AdminExamsPage /> },
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
