import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClient, ApiError } from '@/lib/api-client';
import { createAuthApi } from './api';
import { ownerSignIn, sharedLogin } from './owner-sign-in';
import type { LoginInput, MfaInput } from './schemas';

const sessionKey = ['auth', 'session'];

function useAuthController(client: ApiClient) {
  const queries = useQueryClient();
  const api = useMemo(() => createAuthApi(client), [client]);
  const [challenge, setChallenge] = useState(false);
  const [ownerChallenge, setOwnerChallenge] = useState(false);
  const ownerApi = useMemo(
    () =>
      ownerSignIn(new ApiClient(import.meta.env.VITE_PLATFORM_API_BASE_URL || '/platform-api/v1')),
    [],
  );
  const sessionQuery = useQuery({
    queryKey: sessionKey,
    queryFn: ({ signal }) => api.session(signal),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: !challenge,
    enabled: !challenge,
  });

  function clearPrivateQueries() {
    queries.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
  }

  useEffect(
    () =>
      client.onUnauthorized(() => {
        void queries.cancelQueries();
        queries.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
        queries.setQueryData(sessionKey, null);
        setChallenge(false);
      }),
    [client, queries],
  );

  // A cookie can expire or change in another tab while this app is open.
  const schoolId = sessionQuery.data?.school.id;
  const userId = sessionQuery.data?.user.id;
  useEffect(() => {
    // Newly mounted feature queries already belong to the new identity. Keep
    // those observers alive while removing the previous account's data.
    queries.removeQueries({
      predicate: (query) =>
        query.queryKey[0] !== 'auth' &&
        !(schoolId && userId && query.queryKey[1] === schoolId && query.queryKey[2] === userId),
    });
  }, [schoolId, userId, queries]);

  async function restore() {
    const session = await queries.fetchQuery({
      queryKey: sessionKey,
      queryFn: ({ signal }) => api.session(signal),
      staleTime: 0,
    });
    if (!session)
      throw new ApiError('AUTH_REQUIRED', 'Your session expired. Please sign in again.', 401);
  }

  const login = useMutation({
    mutationFn: async (input: LoginInput) => {
      await queries.cancelQueries();
      clearPrivateQueries();
      queries.setQueryData(sessionKey, null);
      setOwnerChallenge(false);
      const result = await sharedLogin(
        api,
        ownerApi,
        input,
        import.meta.env.VITE_APP_SURFACE === 'combined',
      );
      if (result.status === 'owner_mfa_required') {
        setOwnerChallenge(true);
        setChallenge(true);
        return;
      }
      if (result.status === 'mfa_required') setChallenge(true);
      else await restore();
    },
    retry: false,
    gcTime: 0,
  });
  const verify = useMutation({
    mutationFn: async (input: MfaInput) => {
      if (ownerChallenge) {
        await ownerApi.verify(input);
        window.location.replace('/platform');
        return;
      }
      await api.verify(input);
      await restore();
      setChallenge(false);
    },
    retry: false,
    gcTime: 0,
  });
  const logout = useMutation({
    mutationFn: async () => {
      await api.logout();
      await queries.cancelQueries();
      clearPrivateQueries();
      queries.setQueryData(sessionKey, null);
      setChallenge(false);
    },
    retry: false,
  });

  return {
    session: sessionQuery.data ?? null,
    loading: sessionQuery.isPending,
    sessionError: sessionQuery.error,
    retrySession: () => sessionQuery.refetch(),
    challenge,
    login,
    verify,
    logout,
    resetChallenge: () => {
      setOwnerChallenge(false);
      setChallenge(false);
      client.setCsrfToken(null);
      verify.reset();
      login.reset();
    },
  };
}

const AuthContext = createContext<ReturnType<typeof useAuthController> | null>(null);
export function AuthProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  const auth = useAuthController(client);
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider is missing.');
  return auth;
}
