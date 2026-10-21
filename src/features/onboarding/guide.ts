import type { Role } from '@/features/auth/schemas';
export type GuideStep = { title: string; body: string; path: string };
/** Update this manifest with every user-facing feature addition/removal. Content changes reopen the guide. */
export const guides: Record<Role, GuideStep[]> = {
  school_admin: [
    {
      title: 'Set up your school',
      body: 'Create classes and subjects, then assign teachers. Delete unused records or archive records with history from their cards.',
      path: '/admin/school',
    },
    {
      title: 'Import students into a class',
      body: 'Choose a class in Roster import and preview your CSV. In Accounts, open the class card to find students and issue credentials. New IDs continue across all classes in your school.',
      path: '/admin/school',
    },
    {
      title: 'Approve and schedule exams',
      body: 'Review submitted papers, approve them and schedule a sitting. Published versions and student evidence are preserved.',
      path: '/admin',
    },
    {
      title: 'Support active exams',
      body: 'Use Live exams and Exam assistance to supervise students. Staff approval never extends the original deadline.',
      path: '/admin/assistance',
    },
    {
      title: 'Publish results',
      body: 'Check results and recovery cases before publishing. Practice is released separately from official marks.',
      path: '/admin/results',
    },
  ],
  teacher: [
    {
      title: 'Create a paper',
      body: 'Choose your assigned class and subject, then enter exam details.',
      path: '/teacher',
    },
    {
      title: 'Upload and manage questions',
      body: 'Use a Word or Excel template with answer keys. A stuck import can be cancelled; parsed questions stay in the draft. Unneeded drafts can be removed.',
      path: '/teacher',
    },
    {
      title: 'Review in one action',
      body: 'Use the review overview to confirm all eligible questions together. Resolve missing explanations, topics and flagged answers before submission. Individual review is optional.',
      path: '/teacher',
    },
    {
      title: 'Submit for approval',
      body: 'Submit the saved paper to your administrator. Approval and scheduling remain school-admin actions.',
      path: '/teacher',
    },
    {
      title: 'Provide exam assistance',
      body: 'Assigned staff can approve a student assistance request with a fresh authenticator code on their own device.',
      path: '/teacher/assistance',
    },
  ],
  student: [
    {
      title: 'Prepare for your exam',
      body: 'Open My exams, check the schedule and download the encrypted paper during preparation.',
      path: '/student',
    },
    {
      title: 'Keep your answers safe',
      body: 'Answers save on this device before upload. Keep the tab open when offline and check the last server save separately.',
      path: '/student',
    },
    {
      title: 'Privacy and help',
      body: 'Leaving the window hides questions until Resume. The clock continues. Request assistance when you need staff approval; the guide never appears over an active exam.',
      path: '/student',
    },
    {
      title: 'Finish and check your receipt',
      body: 'Submission is complete only after a confirmed receipt. Pending upload is not a completed submission.',
      path: '/student',
    },
    {
      title: 'View results and practice',
      body: 'Results appear after school publication. Practice is available only when your school releases it.',
      path: '/student/results',
    },
  ],
};
export const guideRevision = (role: Role) => JSON.stringify(guides[role]);
