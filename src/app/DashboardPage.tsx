import { BookOpen, CalendarDays, CircleCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Role } from '@/features/auth/schemas';

const content: Record<Role, { title: string; description: string; steps: string[] }> = {
  student: {
    title: 'Your learning, in one place.',
    description: 'Prepare for your exams, see your results and keep practising.',
    steps: [
      'Check the preparation time shared by your school.',
      'Keep your user ID and password somewhere private.',
      'Use a charged device and connect before your exam.',
    ],
  },
  teacher: {
    title: 'Make room for better learning.',
    description: 'Prepare question papers and follow your classes’ progress.',
    steps: [
      'Prepare questions using the school’s import template.',
      'Review answer keys, topics and explanations.',
      'Send your paper to the school administrator for approval.',
    ],
  },
  invigilator: {
    title: 'Exam assistance',
    description: 'Support your assigned sittings.',
    steps: ['Set up your authenticator', 'Review assigned requests'],
  },
  school_admin: {
    title: 'A clear view of your school.',
    description: 'Coordinate exam preparation, schedules and the release of results.',
    steps: [
      'Prepare student accounts and class assignments.',
      'Review teacher papers before scheduling.',
      'Share preparation times with students and school staff.',
    ],
  },
};

export function DashboardPage() {
  const { session } = useAuth();
  if (!session) return null;
  const copy = content[session.user.role];
  return (
    <>
      <p className="text-sm text-muted-foreground">Welcome, {session.user.displayName}</p>
      <h1 className="mt-2 max-w-xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
        {copy.title}
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
        {copy.description}
      </p>
      <div className="mt-8 rounded-xl border bg-background p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Getting ready</h2>
        </div>
        <ol className="mt-6 grid gap-5">
          {copy.steps.map((step, index) => (
            <li key={step} className="flex items-start gap-4 text-sm leading-relaxed">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-background p-5">
          <CircleCheck className="mb-3 size-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">Your school workspace</h2>
          <p className="mt-2 text-sm text-muted-foreground">{session.school.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">User ID: {session.user.loginId}</p>
        </div>
        <div className="rounded-xl border bg-background p-5">
          <CalendarDays className="mb-3 size-5 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold">One shared exam schedule</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Preparation opens at the time set by your school, before the common start. All exam
            schedules use EAT.
          </p>
        </div>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Dashboard preview. Exam tools will be added in the next build.
      </p>
    </>
  );
}
