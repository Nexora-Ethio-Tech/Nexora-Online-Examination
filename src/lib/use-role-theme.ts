import { useEffect } from 'react';

export const ROLE_NAMES = [
  'platform_owner',
  'school_admin',
  'teacher',
  'student',
  'invigilator',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export function useRoleTheme(role: RoleName) {
  useEffect(() => {
    document.documentElement.dataset.role = role;
    return () => {
      delete document.documentElement.dataset.role;
    };
  }, [role]);
}
