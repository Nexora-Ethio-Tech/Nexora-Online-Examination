import { EthiopianDateTimeField } from '@/components/shared/EthiopianDateTimeField';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiClient, ApiError, errorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { readEnvironment } from '@/lib/env';
import { eatTime } from '@/features/exams/ExamsPage';
import { platformApi, type School, type Admin, type ActionResult } from './api';
import { OwnerGuide } from './OwnerGuide';
import { processingLabel } from './language';
import { administratorEnrollmentLink } from './enrollment-link';

const inputClass = 'mt-1 min-h-11 w-full rounded border bg-background p-2';
export function PlatformApp({ client: provided }: { client?: ApiClient }) {
  const [client] = useState(
    () =>
      provided ??
      new ApiClient(
        readEnvironment({
          baseUrl: import.meta.env.VITE_PLATFORM_API_BASE_URL || '/platform-api/v1',
          production: import.meta.env.PROD,
        }).baseUrl,
      ),
  );
  const [queries] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
  );
  const [owner, setOwner] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const initialize = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      client.setCsrfToken((await platformApi(client).csrf()).csrfToken);
      try {
        setOwner((await platformApi(client).me()).displayName);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        setOwner(null);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [client]);
  useEffect(() => {
    void initialize();
    return client.onUnauthorized(() => {
      setOwner(null);
      queries.clear();
      void initialize();
    });
  }, [client, queries, initialize]);
  return (
    <QueryClientProvider client={queries}>
      <main className="mx-auto min-h-svh max-w-6xl space-y-6 p-4 sm:p-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">Nexora platform owner</p>
            <h1 className="text-2xl font-semibold">Manage your schools</h1>
          </div>
          {import.meta.env.VITE_APP_SURFACE !== 'platform' && (
            <a className="underline" href="/">
              School sign-in
            </a>
          )}
        </header>
        {loading ? (
          <p role="status">Checking owner session…</p>
        ) : error ? (
          <div>
            <p role="alert">{error}</p>
            <Button onClick={() => void initialize()}>Retry connection</Button>
          </div>
        ) : owner ? (
          <>
            <OwnerGuide owner={owner} />
            <div className="flex items-center justify-between gap-3">
              <p>Signed in as {owner}. Actions are recorded under your owner identity.</p>
              <Button
                variant="outline"
                onClick={() => {
                  void platformApi(client)
                    .logout()
                    .then(() => {
                      setOwner(null);
                      queries.clear();
                      void initialize();
                    })
                    .catch((e) => setError(errorMessage(e)));
                }}
              >
                Sign out
              </Button>
            </div>
            <Dashboard client={client} />
          </>
        ) : (
          <OwnerLogin client={client} onLogin={setOwner} />
        )}
      </main>
    </QueryClientProvider>
  );
}
function OwnerLogin({ client, onLogin }: { client: ApiClient; onLogin: (name: string) => void }) {
  const [loginId, setLoginId] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="max-w-md space-y-4 rounded-xl border p-5"
      onSubmit={(e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const body = { loginId, password, code };
        setPassword('');
        setCode('');
        void platformApi(client)
          .login(body)
          .then((r) => {
            client.setCsrfToken(r.csrfToken);
            onLogin(r.displayName);
          })
          .catch((e) => setError(errorMessage(e)))
          .finally(() => setBusy(false));
      }}
    >
      <h2 className="text-xl font-semibold">Owner sign-in</h2>
      <p className="text-sm">
        Use your separately enrolled owner account and a fresh authenticator code.
      </p>
      <label className="block">
        Owner ID
        <input
          className={inputClass}
          autoComplete="username"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          required
          maxLength={100}
        />
      </label>
      <label className="block">
        Password
        <input
          type="password"
          className={inputClass}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          maxLength={1024}
        />
      </label>
      <label className="block">
        Authenticator code
        <input
          className={inputClass}
          inputMode="numeric"
          autoComplete="off"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          pattern="[0-9]{6}"
          maxLength={6}
          required
        />
      </label>
      <Button disabled={busy}>{busy ? 'Signing in…' : 'Sign in as owner'}</Button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function Dashboard({ client }: { client: ApiClient }) {
  const [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState<School | null>(null),
    [creating, setCreating] = useState(false);
  const schools = useQuery({
    queryKey: ['platform', 'schools', cursor],
    queryFn: ({ signal }) => platformApi(client).schools(cursor, signal),
  });
  return (
    <div className="space-y-6">
      <section id="owner-schools" className="space-y-3">
        <h2 className="text-xl font-semibold">Schools</h2>
        <p>Select a school to manage its plan, access or administrators.</p>
        <div className="flex flex-wrap gap-3">
          <Button
            id="owner-add-school"
            onClick={() => {
              setSelected(null);
              setCreating(true);
            }}
          >
            Add school
          </Button>
          <Button variant="outline" onClick={() => void schools.refetch()}>
            Refresh schools
          </Button>
        </div>
        {schools.isPending && <p role="status">Loading schools…</p>}
        {schools.error && <p role="alert">{errorMessage(schools.error)}</p>}
        {schools.data?.schools.length === 0 && <p>No schools on this page.</p>}
        <div className="grid gap-3 md:grid-cols-2">
          {schools.data?.schools.map((s) => (
            <button
              key={s.id}
              className="rounded-xl border p-4 text-left hover:bg-muted"
              onClick={() => {
                setSelected(s);
                setCreating(false);
              }}
            >
              <strong>{s.name}</strong>
              <p>School code: {s.schoolCode}</p>
              <p>
                {s.status} · {s.students} students · {s.teachers} teachers
              </p>
              <p className="text-sm">
                Subscription: {s.subscription}
                {s.expiresAt ? ` · ends ${eatTime(s.expiresAt)}` : ''}
              </p>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" disabled={!cursor} onClick={() => setCursor(null)}>
            First page
          </Button>
          <Button
            variant="outline"
            disabled={!schools.data?.nextCursor}
            onClick={() => setCursor(schools.data?.nextCursor ?? null)}
          >
            Next page
          </Button>
        </div>
      </section>
      {(creating || selected) && (
        <OwnerActions
          key={selected?.id ?? 'new'}
          client={client}
          school={selected}
          close={() => {
            setSelected(null);
            setCreating(false);
          }}
        />
      )}
      <Health client={client} />
      <Audit client={client} />
    </div>
  );
}
function OwnerActions({
  client,
  school,
  close,
}: {
  client: ApiClient;
  school: School | null;
  close: () => void;
}) {
  const queries = useQueryClient();
  const [action, setAction] = useState(school ? 'subscription' : 'provision');
  const [reason, setReason] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [name, setName] = useState(''),
    [slug, setSlug] = useState(''),
    [loginId, setLoginId] = useState(''),
    [firstName, setFirstName] = useState(''),
    [fatherName, setFatherName] = useState(''),
    [grandfatherName, setGrandfatherName] = useState(''),
    [phoneNumber, setPhoneNumber] = useState(''),
    [recoveryEmail, setRecoveryEmail] = useState('');
  const [state, setState] = useState('active'),
    [date, setDate] = useState(''),
    [confirmed, setConfirmed] = useState(false),
    [resetMfa, setResetMfa] = useState(false);
  const [admins, setAdmins] = useState<Admin[]>([]),
    [adminId, setAdminId] = useState(''),
    [result, setResult] = useState<ActionResult | null>(null);
  const retry = useRef<{ fingerprint: string; id: string } | null>(null);
  useEffect(() => {
    if (!result?.credential) return;
    const timer = setTimeout(
      () =>
        setResult((current) =>
          current ? { ...current, credential: null, enrollmentToken: null } : null,
        ),
      60_000,
    );
    return () => clearTimeout(timer);
  }, [result]);
  async function submit() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      let command: Record<string, unknown> = { action, reason };
      if (!school)
        command = {
          ...command,
          name,
          slug,
          loginId,
          firstName,
          fatherName,
          grandfatherName,
          phoneNumber,
          recoveryEmail,
        };
      else if (action === 'create_admin')
        command = {
          ...command,
          schoolId: school.id,
          loginId,
          firstName,
          fatherName,
          grandfatherName,
          phoneNumber,
          recoveryEmail,
        };
      else if (action === 'edit_admin')
        command = {
          ...command,
          schoolId: school.id,
          adminId,
          firstName,
          fatherName,
          grandfatherName,
          phoneNumber,
          recoveryEmail,
          expectedRevision: admins.find((a) => a.id === adminId)?.revision,
        };
      else if (action === 'status')
        command = {
          ...command,
          schoolId: school.id,
          status: school.status === 'active' ? 'inactive' : 'active',
          expectedRevision: school.revision,
          confirmedImpact: confirmed,
        };
      else if (action === 'reset_admin')
        command = {
          ...command,
          schoolId: school.id,
          adminId,
          resetMfa,
          identityVerified: confirmed,
        };
      else
        command = {
          ...command,
          schoolId: school.id,
          state,
          expiresAt: date ? new Date(`${date}T23:59:59+03:00`).toISOString() : null,
          expectedRevision: school.subscriptionRevision,
        };
      const fingerprint = JSON.stringify(command);
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, id: crypto.randomUUID() };
      const submittedCode = code;
      setCode('');
      const response = await platformApi(client).action({
        ...command,
        code: submittedCode,
        requestId: retry.current.id,
      });
      setResult(response);
      // Keep the key after success too: accidental duplicate clicks replay without a new credential.
      await queries.invalidateQueries({ queryKey: ['platform'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex justify-between gap-3">
        <h2 className="text-xl font-semibold">{school ? school.name : 'Create a school'}</h2>
        <Button variant="ghost" onClick={close}>
          Close
        </Button>
      </div>
      {school && <p>School code: {school.schoolCode}</p>}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {school ? (
          <label className="block">
            What would you like to do?
            <select
              className={inputClass}
              value={action}
              disabled={busy}
              onChange={(e) => {
                setAction(e.target.value);
                setResult(null);
                setConfirmed(false);
              }}
            >
              <option value="subscription">Manage subscription</option>
              <option value="status">
                {school.status === 'active' ? 'Suspend school access' : 'Reactivate school'}
              </option>
              <option value="reset_admin">Recover school administrator</option>
              <option value="create_admin">Add school administrator</option>
              <option value="edit_admin">Edit administrator information</option>
            </select>
          </label>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              School name
              <input
                className={inputClass}
                required
                maxLength={150}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              School address name (lowercase)
              <input
                className={inputClass}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={100}
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
            <label>
              First administrator ID
              <input
                className={inputClass}
                required
                maxLength={100}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              />
            </label>

            <p className="text-sm sm:col-span-2">
              Creates a 30-day trial. The administrator can sign in after completing authenticator
              setup.
            </p>
          </div>
        )}
        {school && action === 'create_admin' && (
          <div className="space-y-3">
            <label className="block">
              New administrator ID
              <input
                className={inputClass}
                required
                maxLength={100}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
              />
            </label>

            <p>The new administrator can sign in after completing authenticator setup.</p>
          </div>
        )}
        {(!school || action === 'create_admin' || action === 'edit_admin') && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ['First name', firstName, setFirstName],
              ["Father's name", fatherName, setFatherName],
              ["Grandfather's name", grandfatherName, setGrandfatherName],
              ['Phone number', phoneNumber, setPhoneNumber],
              ['Recovery email', recoveryEmail, setRecoveryEmail],
            ].map(([label, value, setter]) => (
              <label key={String(label)}>
                {String(label)}
                <input
                  className={inputClass}
                  required
                  type={label === 'Recovery email' ? 'email' : 'text'}
                  value={String(value)}
                  onChange={(e) => {
                    if (typeof setter === 'function') setter(e.target.value);
                  }}
                />
              </label>
            ))}
          </div>
        )}
        {school && action === 'subscription' && (
          <div className="space-y-3">
            <label className="block">
              Subscription state
              <select
                className={inputClass}
                value={state}
                onChange={(e) => setState(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="restricted">Restrict new scheduling</option>
              </select>
            </label>
            <EthiopianDateTimeField
              label="Valid through (EAT; empty means no expiry)"
              dateOnly
              optional
              value={date}
              onChange={setDate}
            />
            <p>
              Changes affect new scheduling and rescheduling. Existing exam delivery and saved work
              remain available. Payments are recorded manually; this does not charge a payment
              method.
            </p>
          </div>
        )}
        {school && action === 'status' && (
          <label className="flex gap-3">
            <input
              type="checkbox"
              required
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              I understand suspension blocks school access, including ongoing exams, and revokes
              sessions. This is an emergency action, not a billing restriction.
            </span>
          </label>
        )}
        <label className="block">
          Reason
          <textarea
            className={inputClass}
            required
            minLength={5}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        {school && (action === 'reset_admin' || action === 'edit_admin') && (
          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy || reason.trim().length < 5}
              onClick={() => {
                setBusy(true);
                setError('');
                void platformApi(client)
                  .inspect(school.id, reason)
                  .then((r) => setAdmins(r.admins))
                  .catch((e) => setError(errorMessage(e)))
                  .finally(() => setBusy(false));
              }}
            >
              Load administrators for this reason
            </Button>
            <label className="block">
              Administrator
              <select
                className={inputClass}
                required
                value={adminId}
                onChange={(e) => {
                  setAdminId(e.target.value);
                  const a = admins.find((a) => a.id === e.target.value);
                  if (a) {
                    setFirstName(a.firstName ?? '');
                    setFatherName(a.fatherName ?? '');
                    setGrandfatherName(a.grandfatherName ?? '');
                    setPhoneNumber(a.phoneNumber ?? '');
                    setRecoveryEmail(a.recoveryEmail ?? '');
                  }
                }}
              >
                <option value="">Choose administrator</option>
                {admins.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName} ({a.loginId}) · {a.status} ·{' '}
                    {a.mfaEnrolled ? 'MFA confirmed' : 'MFA pending'}
                  </option>
                ))}
              </select>
            </label>
            <div hidden={action !== 'reset_admin'}>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={resetMfa}
                  onChange={(e) => setResetMfa(e.target.checked)}
                />
                Also invalidate MFA and deactivate the account until protected re-enrollment
              </label>
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  required={action === 'reset_admin'}
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I verified this administrator's identity through the school's trusted support
                contact.
              </label>
              <p className="text-sm">
                Both options replace the password and revoke sessions. A new password is shown once;
                it is never stored in the audit trail.
              </p>
            </div>
          </div>
        )}
        <label className="block">
          Fresh owner authenticator code
          <input
            className={inputClass}
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{6}"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <p className="text-sm">
          Wait for a new code after login or another action. After a conflict, close this panel and
          select the refreshed school.
        </p>
        <Button disabled={busy}>{busy ? 'Working…' : 'Confirm owner action'}</Button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result?.enrollmentToken && (
        <p>
          Private setup link (expires in 30 minutes):{' '}
          <a
            className="underline break-all"
            href={administratorEnrollmentLink(
              result.enrollmentToken,
              import.meta.env.VITE_SCHOOL_PORTAL_ORIGIN || window.location.origin,
            )}
          >
            {administratorEnrollmentLink(
              result.enrollmentToken,
              import.meta.env.VITE_SCHOOL_PORTAL_ORIGIN || window.location.origin,
            )}
          </a>
          . Share privately with this administrator alongside their login ID. The password is shown
          separately below.
        </p>
      )}
      {result && (
        <div className="space-y-3 rounded border p-4" role="status">
          <p>{result.message}</p>
          <p className="break-all text-sm">
            {result.loginId && (
              <>
                Administrator login ID: <strong>{result.loginId}</strong>
              </>
            )}
          </p>
          {result.credential ? (
            <>
              <p>
                Save this password privately and deliver it through the verified support channel. It
                disappears when this panel closes.
              </p>
              <code className="block break-all select-all">{result.credential}</code>
              <Button variant="outline" onClick={() => setResult({ ...result, credential: null })}>
                Hide password
              </Button>
            </>
          ) : (
            result.replayed && (
              <p>
                This action was already committed. Credentials cannot be retrieved again; use an
                explicit new reset if the original response was lost.
              </p>
            )
          )}
        </div>
      )}
    </section>
  );
}
function Health({ client }: { client: ApiClient }) {
  const data = useQuery({
    queryKey: ['platform', 'health'],
    queryFn: ({ signal }) => platformApi(client).health(signal),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  return (
    <section id="owner-health" className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Processing status</h2>
      <p className="text-sm">
        Refreshes every minute while visible. Queue counts do not prove a worker is running.
      </p>
      {data.error && <p role="alert">Snapshot unavailable or stale. {errorMessage(data.error)}</p>}
      {data.isPending && <p role="status">Loading health…</p>}
      {data.data && (
        <>
          <p>Database reachable at {eatTime(data.data.sampledAt)}</p>
          <ul>
            {data.data.queues.map((q) => (
              <li key={`${q.queue}:${q.status}`}>
                {processingLabel(q.queue)} · {processingLabel(q.status)}: {q.count}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
function Audit({ client }: { client: ApiClient }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const data = useQuery({
    queryKey: ['platform', 'audit', cursor],
    queryFn: ({ signal }) => platformApi(client).audit(cursor, signal),
  });
  return (
    <section id="owner-activity" className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Owner activity</h2>
      <p className="text-sm">Up to 100 events per page. Exports contain this page only.</p>
      {data.error && <p role="alert">{errorMessage(data.error)}</p>}
      {data.isPending && <p role="status">Loading audit events…</p>}
      <div className="max-h-96 overflow-auto">
        <ul className="space-y-3">
          {data.data?.events.map((e) => (
            <li key={e.id} className="border-b pb-2">
              <strong>{e.action}</strong> · {eatTime(e.at)}
              <p>{e.reason}</p>
              <p className="break-all text-xs">
                Owner: {e.ownerId ?? 'Protected operator'} · School: {e.schoolId ?? 'Platform'}
              </p>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={() => {
            setCursor(null);
            void data.refetch();
          }}
        >
          Latest events
        </Button>
        <Button
          variant="outline"
          disabled={!data.data?.nextCursor}
          onClick={() => setCursor(data.data?.nextCursor ?? null)}
        >
          Older events
        </Button>
        <Button
          variant="outline"
          disabled={!data.data}
          onClick={() => {
            if (!data.data) return;
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data.data.events, null, 2)], { type: 'application/json' }),
            );
            const a = document.createElement('a');
            a.href = url;
            a.download = 'nexora-platform-audit-page.json';
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Export this page
        </Button>
      </div>
    </section>
  );
}
