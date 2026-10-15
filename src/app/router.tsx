import { Navigate, Outlet, createBrowserRouter, type RouteObject } from 'react-router';
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
        <h1 className="mb-6 text-2xl font-semibold">We couldn’t check your session</h1>
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
                      { path: 'school', element: <SchoolSetupPage /> },
                      { path: 'practice', element: <AdminPracticePage /> },
                      { path: 'recovery', element: <RecoveryPage /> },
                      { path: 'recovery/:recoveryId', element: <RecoveryDetailPage /> },
                      { path: 'results', element: <ResultsPage /> },
                      { path: 'results/:sessionId', element: <ResultDetail /> },
                      { path: 'exams/:examId', element: <AdminExamDetail /> },
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
