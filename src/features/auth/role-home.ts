import type { Role } from './schemas';
export const roleHome: Record<Role, string> = {
  invigilator: '/invigilator',
  student: '/student',
  teacher: '/teacher',
  school_admin: '/admin',
};
export const roleLabel: Record<Role, string> = {
  invigilator: 'Invigilator',
  student: 'Student',
  teacher: 'Teacher',
  school_admin: 'School administrator',
};
