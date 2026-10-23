import type { Role } from '@/features/auth/schemas';
export type GuideStep = { title: string; body: string; path: string };
/** Update this manifest with every user-facing feature addition/removal. Content changes reopen the guide. */
export const guides: Record<Role, GuideStep[]> = {
  invigilator: [
    {
      title: 'Set up your authenticator',
      body: 'In Exam assistance, set up your authenticator on your own device before supervising. Keep the setup key private.',
      path: '/invigilator',
    },
    {
      title: 'Support assigned exams',
      body: 'Choose an assigned sitting. Verify the student, then approve a help request with a fresh authenticator code on your own device. The original deadline continues.',
      path: '/invigilator',
    },
  ],
  school_admin: [
    {
      title: 'Set up your school',
      body: 'Create classes using Grade and Section, then create subjects for each grade and assign teachers. Find assignments by grade, class, subject or teacher. Use Accounts → Invigilators to create limited accounts for non-teaching staff. Delete class removes it from current use while previous exam results remain.',
      path: '/admin/school?tab=classes',
    },
    {
      title: 'Import students into a class',
      body: 'Choose a class in Roster import and preview your CSV. In Accounts, open the class card to find students and give students their login details. New IDs continue across all classes in your school and end with the year of creation. Use Edit to change student details or reset a password.',
      path: '/admin/school?tab=roster',
    },
    {
      title: 'Approve and schedule exams',
      body: 'Review submitted papers, approve them and switch between Ethiopian and Gregorian calendar dates. Use the month, day and year controls or open the seven-day calendar. The date summary also shows the Gregorian equivalent. Preparation and results are side by side on wider screens. Ethiopian months are in Amharic. School time refreshes automatically. Times use AM/PM in EAT. Choose 1–120 preparation minutes (10 by default). Check the exam start, end and results dates before confirming. Then assign invigilators under the saved sitting dates and check their authenticator readiness.',
      path: '/admin',
    },
    {
      title: 'Support active exams',
      body: 'Use Live exams and Exam assistance to supervise students. Review browser incident descriptions as device reports, not proof that a screenshot was captured. The incident panel groups received reports and offers filters and review recommendations, not automatic server penalties. Staff approval never extends the original deadline.',
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
      body: 'Choose your assigned class and subject, then enter exam details. Date forms offer Ethiopian and Gregorian calendars; times use AM/PM in EAT.',
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
      body: 'Open Exam assistance to set up your authenticator with a private QR code and confirmation. Assigned staff approve student requests with a fresh code on their own device; no staff codes are entered on student screens.',
      path: '/teacher/assistance',
    },
  ],
  student: [
    {
      title: 'Prepare for your exam',
      body: 'Use Current exams, Upcoming exams and Past exams in My exams. Past exams can be filtered by published grades, awaiting results, or no grade. Needs attention keeps unfinished submissions visible. Check the Ethiopian calendar date. Times use AM/PM in EAT, even if your device uses another timezone. Choose Download exam when preparation opens. Follow the download progress, keep this page open and stay connected until the exam starts.',
      path: '/student',
    },
    {
      title: 'Keep your answers safe',
      body: 'Answers save on this device before upload. Keep the tab open when offline and check when your school last received your answers.',
      path: '/student',
    },
    {
      title: 'Privacy and help',
      body: 'Choose Start exam to enter required fullscreen. Leaving the window, restricted shortcuts or moving the pointer outside hides questions. Resume becomes available after a short wait; five interruptions lock editing in this browser. The clock continues. Questions carry a student ID and attempt watermark and cannot be printed. Request assistance when you need staff approval; the guide never appears over an active exam.',
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
export const guideRevision = (role: Role) =>
  JSON.stringify({ presentation: 'speech-bubble-rounded-v2', steps: guides[role] });
