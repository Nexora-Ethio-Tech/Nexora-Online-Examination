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
      body: 'Choose a class in Roster import and preview your CSV. In Accounts, open the class card to find students and give students their login details. New IDs continue across all classes in your school.',
      path: '/admin/school',
    },
    {
      title: 'Approve and schedule exams',
      body: 'Review submitted papers, approve them and choose Ethiopian calendar dates with Amharic months. Times use AM/PM in EAT. Check the exam start, end and results dates before confirming.',
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
      body: 'Choose your assigned class and subject, then enter exam details. Portal dates use the Ethiopian calendar with Amharic months; times use AM/PM in EAT.',
      path: '/teacher',
    },
    {
      title: 'Upload and manage questions',
      body: 'Use a Word or Excel template with answer keys. File reading happens before AI suggestions. If a file stays waiting to be read, contact your administrator. A stuck import can be cancelled; questions already read stay in the draft. Unneeded drafts can be removed.',
      path: '/teacher',
    },
    {
      title: 'Review in one action',
      body: 'Use Confirm all questions without warnings for complete questions. Questions with warnings need individual attention. On phones, open a question card to edit it, then use Previous question or Next question.',
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
      body: 'Open My exams and check the Ethiopian calendar date. Times use AM/PM in EAT, even if your device uses another timezone. Choose Download exam when preparation opens and stay connected until the exam starts.',
      path: '/student',
    },
    {
      title: 'Keep your answers safe',
      body: 'Answers save on this device before upload. Keep the tab open when offline and check when your school last received your answers.',
      path: '/student',
    },
    {
      title: 'Privacy and help',
      body: 'Leaving the window hides questions until Resume. The clock continues. Questions carry an attempt watermark and cannot be printed. Request assistance when you need staff approval; the guide never appears over an active exam.',
      path: '/student',
    },
    {
      title: 'Finish and check your submission',
      body: 'Wait for Submitted successfully after sending your final answers. If answers are waiting to send, keep the page open and reconnect.',
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
