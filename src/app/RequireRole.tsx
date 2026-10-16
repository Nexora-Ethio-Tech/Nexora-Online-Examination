import { Navigate, Outlet } from 'react-router';
import { useAuth } from '@/features/auth/AuthProvider';
import type { Role } from '@/features/auth/schemas';
import { roleHome } from '@/features/auth/role-home';

export function RequireRole({ role }: { role: Role }) {
  const auth = useAuth();
  if (!auth.session) return <Navigate to={auth.challenge ? '/mfa' : '/login'} replace />;
  if (auth.session.user.role !== role)
    return <Navigate to={roleHome[auth.session.user.role]} replace />;
  return <Outlet />;
}
