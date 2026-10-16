import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useBeforeUnload, useBlocker } from 'react-router';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useApiClient } from '@/lib/ApiProvider';
import { control, Failure, panel, useTeacherScope } from '@/features/exams/authoring/TeacherPage';
import { eatTime } from '@/features/exams/ExamsPage';
import { schoolApi } from './api';
import { credentialsCsv } from './csv';
import type { Account, CredentialIssue, SchoolClass, Subject } from './schemas';
import { RosterImport } from './RosterImport';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Reason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Reason">
      <textarea
        className={control}
        required
        maxLength={2000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}
export function useSchoolOperation() {
  const cache = useQueryClient();
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState('');
  const retained = useRef<{ signature: string; key: string } | null>(null);
  // Direct requests keep one-time credentials out of TanStack Query's mutation cache.
  async function run<T>(
    signature: string,
    call: (key: string) => Promise<T>,
    done: (value: T) => void = () => undefined,
  ) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    setMessage('');
    if (retained.current?.signature !== signature)
      retained.current = { signature, key: crypto.randomUUID() };
    try {
      const value = await call(retained.current.key);
      done(value);
      setMessage('Saved successfully.');
      await cache.invalidateQueries({ queryKey: ['school'] });
      await cache.invalidateQueries({ queryKey: ['teaching-assignments'] });
    } catch (failure) {
      setError(failure);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return {
    pending,
    run,
    feedback: (
      <>
        <Failure error={error} />
        {message && <p role="status">{message}</p>}
      </>
    ),
  };
}
export function useSchoolPage<T>(
  key: string[],
  call: (
    cursor: string | null,
    signal: AbortSignal,
  ) => Promise<{ items: T[]; nextCursor: string | null; serverNow: string }>,
) {
  const scope = useTeacherScope();
  const query = useInfiniteQuery({
    queryKey: ['school', ...scope, ...key],
    initialPageParam: null,
    queryFn: ({ pageParam, signal }: { pageParam: string | null; signal: AbortSignal }) =>
      call(pageParam, signal),
    getNextPageParam: (p) => p.nextCursor ?? undefined,
  });
  return {
    rows: query.data?.pages.flatMap((p) => p.items) ?? [],
    query,
    controls: (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Refresh
        </Button>
        {query.hasNextPage && (
          <Button
            type="button"
            variant="outline"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more
          </Button>
        )}
        {query.isPending && <p role="status">Loading school records…</p>}
        <Failure error={query.error} />
      </div>
    ),
  };
}
export function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function CredentialPanel({ issue, close }: { issue: CredentialIssue; close: () => void }) {
  const [downloaded, setDownloaded] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  return (
    <section className={`${panel} space-y-4`} aria-label="One-time credentials">
      <h2 className="text-2xl font-semibold">
        {issue.credentials ? 'Save these credentials now' : 'Credentials were already issued'}
      </h2>
      <p>
        {issue.issuedCount} account(s) · {eatTime(issue.issuedAt)}
      </p>
      {issue.credentials ? (
        <>
          <p>
            This list is available only in this view. Save it privately before closing. Leaving this
            page, reloading or signing out clears it; lost passwords must be reset. Share each
            account only with its intended user.
          </p>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Generated account credentials</caption>
              <thead>
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">User ID</th>
                  <th className="p-3">Password</th>
                </tr>
              </thead>
              <tbody>
                {issue.credentials.map((c) => (
                  <tr className="border-t" key={c.userId}>
                    <td className="p-3">{c.displayName}</td>
                    <td className="p-3">
                      <code>{c.loginId}</code>
                    </td>
                    <td className="p-3">
                      <code className="break-all">{c.password}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            className="min-h-11"
            disabled={downloaded}
            onClick={() => {
              if (issue.credentials) {
                downloadCsv(credentialsCsv(issue.credentials), 'nexora-private-credentials.csv');
                setDownloaded(true);
              }
            }}
          >
            {downloaded ? 'Download requested' : 'Download credentials CSV once'}
          </Button>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            I saved the credentials, or understand that missing passwords will need a reset.
          </label>
        </>
      ) : (
        <>
          <p>
            The original response is no longer available. Retrying did not create new passwords. If
            you did not save the first list, search Accounts by these user IDs and reset their
            passwords.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {issue.accounts.map((a) => (
              <li key={a.userId}>
                {a.displayName} · {a.loginId}
              </li>
            ))}
          </ul>
        </>
      )}
      <Button
        className="min-h-11"
        variant="outline"
        disabled={!!issue.credentials && !acknowledged}
        onClick={close}
      >
        Close credential view
      </Button>
    </section>
  );
}
function StructurePage({ kind }: { kind: 'class' | 'subject' }) {
  const api = schoolApi(useApiClient());
  const classes = useSchoolPage(['classes'], api.classes);
  const subjects = useSchoolPage(['subjects'], api.subjects);
  const list = kind === 'class' ? classes : subjects;
  const [selected, setSelected] = useState<SchoolClass | Subject | null>(null);
  return (
    <div className="space-y-5">
      <StructureForm
        key={`${kind}:${selected && ('classId' in selected ? selected.classId : selected.subjectId)}:${selected?.revision}`}
        kind={kind}
        selected={selected}
        onDone={() => setSelected(null)}
      />
      {list.controls}
      <div className="grid gap-3 sm:grid-cols-2">
        {list.rows.map((row) => (
          <section
            className={`${panel} space-y-2`}
            key={'classId' in row ? row.classId : row.subjectId}
          >
            <h3 className="font-semibold">{row.name}</h3>
            <p>
              {'academicYear' in row ? row.academicYear : row.code} ·{' '}
              {row.active ? 'Active' : 'Archived'}
            </p>
            <Button variant="outline" onClick={() => setSelected(row)}>
              Edit {row.name}
            </Button>
          </section>
        ))}
      </div>
      {!list.query.isPending && !list.rows.length && !list.query.error && (
        <p>No {kind === 'class' ? 'classes' : 'subjects'} yet.</p>
      )}
    </div>
  );
}
function StructureForm({
  kind,
  selected,
  onDone,
}: {
  kind: 'class' | 'subject';
  selected: SchoolClass | Subject | null;
  onDone: () => void;
}) {
  const api = schoolApi(useApiClient());
  const op = useSchoolOperation();
  const [name, setName] = useState(selected?.name ?? '');
  const [detail, setDetail] = useState(
    selected ? ('academicYear' in selected ? selected.academicYear : selected.code) : '',
  );
  const [active, setActive] = useState(selected?.active ?? true);
  const [reason, setReason] = useState('');
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          name: name.trim(),
          ...(kind === 'class' ? { academicYear: detail.trim() } : { code: detail.trim() }),
          reason: reason.trim(),
          ...(selected ? { revision: selected.revision, active } : {}),
        };
        void op.run<SchoolClass | Subject>(
          JSON.stringify([selected, body]),
          (key) =>
            kind === 'class'
              ? api.saveClass(
                  selected && 'classId' in selected ? selected.classId : null,
                  body,
                  key,
                )
              : api.saveSubject(
                  selected && 'subjectId' in selected ? selected.subjectId : null,
                  body,
                  key,
                ),
          () => {
            if (selected) onDone();
            else {
              setName('');
              setDetail('');
              setReason('');
            }
          },
        );
      }}
    >
      <h2 className="text-xl font-semibold">
        {selected ? 'Edit' : 'Add'} {kind}
      </h2>
      <fieldset className="space-y-4" disabled={op.pending}>
        <Field label={kind === 'class' ? 'Class name' : 'Subject name'}>
          <input
            className={control}
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={kind === 'class' ? 'Academic year' : 'Subject code'}>
          <input
            className={control}
            required
            maxLength={30}
            pattern={kind === 'subject' ? '[A-Za-z0-9_-]+' : undefined}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
          />
        </Field>
        {selected && (
          <label className="flex gap-3">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active {kind}
          </label>
        )}
        <Reason value={reason} onChange={setReason} />
        <div className="flex gap-3">
          <Button className="min-h-11" disabled={!name.trim() || !detail.trim() || !reason.trim()}>
            Save {kind}
          </Button>
          {selected && (
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel edit
            </Button>
          )}
        </div>
      </fieldset>
      {op.feedback}
    </form>
  );
}
function AccountsPage({ showIssue }: { showIssue: (v: CredentialIssue) => void }) {
  const [role, setRole] = useState<'student' | 'teacher'>('student');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('');
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        {(['student', 'teacher'] as const).map((value) => (
          <Button
            key={value}
            variant={role === value ? 'default' : 'outline'}
            onClick={() => {
              setRole(value);
              setFilter('');
              setSearch('');
            }}
          >
            {value === 'student' ? 'Students' : 'Teachers'}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setFilter(search.trim());
        }}
      >
        <Field label="Search accounts">
          <input
            className={control}
            maxLength={160}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Button>Search</Button>
      </form>
      <AccountList key={`${role}:${filter}`} role={role} search={filter} showIssue={showIssue} />
    </div>
  );
}
function AccountList({
  role,
  search,
  showIssue,
}: {
  role: 'student' | 'teacher';
  search: string;
  showIssue: (v: CredentialIssue) => void;
}) {
  const api = schoolApi(useApiClient());
  const list = useSchoolPage(['accounts', role, search], (cursor, signal) =>
    api.accounts(role, search, cursor, signal),
  );
  const classes = useSchoolPage(['classes'], api.classes);
  const op = useSchoolOperation();
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState<Account[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [resetting, setResetting] = useState<Account | null>(null);
  const show = (v: CredentialIssue) => {
    setChecked([]);
    setConfirmed(false);
    showIssue(v);
  };
  return (
    <>
      {role === 'teacher' && (
        <form
          className={`${panel} space-y-4`}
          onSubmit={(e) => {
            e.preventDefault();
            void op.run(
              JSON.stringify(['teacher', name, reason]),
              (key) => api.createTeacher(name.trim(), reason.trim(), key),
              show,
            );
          }}
        >
          <h2 className="text-xl font-semibold">Add teacher</h2>
          <fieldset disabled={op.pending} className="space-y-3">
            <Field label="Teacher name">
              <input
                className={control}
                required
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Reason value={reason} onChange={setReason} />
            <Button className="min-h-11" disabled={!name.trim() || !reason.trim()}>
              Create teacher and credentials
            </Button>
          </fieldset>
        </form>
      )}
      {role === 'student' && (
        <p>
          Import students in the Roster import tab, then select unissued accounts below to generate
          their credentials.
        </p>
      )}
      {list.controls}
      {role === 'student' &&
        list.rows.some((a) => a.credentialState === 'unissued' && a.status === 'active') && (
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              disabled={op.pending}
              onClick={() => {
                setChecked(
                  list.rows
                    .filter((a) => a.credentialState === 'unissued' && a.status === 'active')
                    .slice(0, 500),
                );
                setConfirmed(false);
              }}
            >
              Select loaded unissued students (up to 500)
            </Button>
            <Button
              variant="outline"
              disabled={op.pending || !checked.length}
              onClick={() => {
                setChecked([]);
                setConfirmed(false);
              }}
            >
              Clear selection
            </Button>
          </div>
        )}
      <div className="space-y-3">
        {list.rows.map((a) => (
          <section key={a.userId} className={`${panel} space-y-3`}>
            <h3 className="font-semibold">{a.displayName}</h3>
            <p>
              {a.loginId} · {a.status === 'active' ? 'Active' : 'Inactive'} ·{' '}
              {a.credentialState === 'unissued' ? 'Credentials not issued' : 'Credentials issued'}
            </p>
            {a.studentRef && (
              <p>
                Student reference: {a.studentRef}
                {a.classId && classes.rows.find((c) => c.classId === a.classId)
                  ? ` · ${classes.rows.find((c) => c.classId === a.classId)?.name}`
                  : ''}
              </p>
            )}
            {role === 'student' && a.credentialState === 'unissued' && a.status === 'active' && (
              <label className="flex gap-3">
                <input
                  type="checkbox"
                  checked={checked.some((v) => v.userId === a.userId)}
                  disabled={op.pending}
                  onChange={(e) => {
                    setConfirmed(false);
                    setChecked(
                      e.target.checked
                        ? [...checked, a]
                        : checked.filter((v) => v.userId !== a.userId),
                    );
                  }}
                />
                Select {a.displayName} for credentials
              </label>
            )}
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(a);
                  setResetting(null);
                }}
              >
                Edit {a.displayName}
              </Button>
              <Button
                variant="outline"
                disabled={a.status !== 'active'}
                onClick={() => {
                  setResetting(a);
                  setEditing(null);
                }}
              >
                Reset password for {a.displayName}
              </Button>
            </div>
          </section>
        ))}
      </div>
      {!list.query.isPending && !list.query.error && !list.rows.length && (
        <p>No matching accounts.</p>
      )}
      {checked.length > 0 && (
        <form
          className={`${panel} space-y-3`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirmed) return;
            const targets = checked.map(({ userId, revision }) => ({ userId, revision }));
            void op.run(
              JSON.stringify([targets, reason]),
              (key) => api.generate(targets, reason.trim(), key),
              show,
            );
          }}
        >
          <h2 className="text-xl font-semibold">Issue credentials to {checked.length} students</h2>
          <fieldset disabled={op.pending} className="space-y-3">
            <Reason value={reason} onChange={setReason} />
            <label className="flex gap-3">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I checked the selected students and am ready to save their credentials.
            </label>
            <Button
              className="min-h-11"
              disabled={!reason.trim() || !confirmed || checked.length > 500}
            >
              Generate selected credentials
            </Button>
          </fieldset>
        </form>
      )}
      {op.feedback}
      {editing && (
        <AccountEditor
          key={`${editing.userId}:${editing.revision}`}
          account={editing}
          classes={classes.rows}
          more={classes.controls}
          close={() => setEditing(null)}
        />
      )}
      {resetting && (
        <PasswordReset
          key={`${resetting.userId}:${resetting.revision}`}
          account={resetting}
          close={() => setResetting(null)}
          showIssue={showIssue}
        />
      )}
    </>
  );
}
function PasswordReset({
  account,
  close,
  showIssue,
}: {
  account: Account;
  close: () => void;
  showIssue: (v: CredentialIssue) => void;
}) {
  const api = schoolApi(useApiClient());
  const op = useSchoolOperation();
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirmed)
          void op.run(
            JSON.stringify([account.userId, account.revision, reason]),
            (key) => api.reset(account, reason.trim(), key),
            (v) => {
              close();
              showIssue(v);
            },
          );
      }}
    >
      <h2 className="text-xl font-semibold">Reset {account.displayName}'s password</h2>
      <p>
        {account.loginId}. The old password will stop working and existing sessions will be signed
        out. Saved exam answers and recovery evidence are preserved.
      </p>
      <fieldset disabled={op.pending} className="space-y-3">
        <Reason value={reason} onChange={setReason} />
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I verified this account and understand the sign-out effect.
        </label>
        <div className="flex gap-3">
          <Button className="min-h-11" disabled={!reason.trim() || !confirmed}>
            Reset and show new credentials
          </Button>
          <Button type="button" variant="outline" onClick={close}>
            Cancel reset
          </Button>
        </div>
      </fieldset>
      {op.feedback}
    </form>
  );
}
function AccountEditor({
  account,
  classes,
  more,
  close,
}: {
  account: Account;
  classes: SchoolClass[];
  more: ReactNode;
  close: () => void;
}) {
  const api = schoolApi(useApiClient());
  const op = useSchoolOperation();
  const [name, setName] = useState(account.displayName);
  const [classId, setClassId] = useState(account.classId ?? '');
  const [active, setActive] = useState(account.status === 'active');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        const body = {
          revision: account.revision,
          displayName: name.trim(),
          classId: account.role === 'student' ? classId : null,
          status: active ? ('active' as const) : ('inactive' as const),
          reason: reason.trim(),
        };
        if (confirmed)
          void op.run(
            JSON.stringify([account.userId, body]),
            (key) => api.editAccount(account.role, account.userId, body, key),
            close,
          );
      }}
    >
      <h2 className="text-xl font-semibold">Edit account: {account.loginId}</h2>
      <p>
        Class changes apply to future exam rosters. Deactivating an account stops access and signs
        it out.
      </p>
      <fieldset disabled={op.pending} className="space-y-3">
        <Field label="Account name">
          <input
            className={control}
            required
            maxLength={160}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setConfirmed(false);
            }}
          />
        </Field>
        {account.role === 'student' && (
          <>
            <Field label="Student class">
              <select
                className={control}
                required
                value={classId}
                onChange={(e) => {
                  setClassId(e.target.value);
                  setConfirmed(false);
                }}
              >
                {!classes.some((c) => c.classId === classId) && (
                  <option value={classId}>Current class — load records to see its name</option>
                )}
                {classes
                  .filter((c) => c.active || c.classId === account.classId)
                  .map((c) => (
                    <option key={c.classId} value={c.classId}>
                      {c.name} · {c.academicYear}
                    </option>
                  ))}
              </select>
            </Field>
            {more}
          </>
        )}
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => {
              setActive(e.target.checked);
              setConfirmed(false);
            }}
          />
          Account active
        </label>
        <Reason value={reason} onChange={setReason} />
        <label className="flex gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I checked the account changes.
        </label>
        <div className="flex gap-3">
          <Button disabled={!confirmed || !name.trim() || !reason.trim()}>
            Save account changes
          </Button>
          <Button type="button" variant="outline" onClick={close}>
            Cancel edit
          </Button>
        </div>
      </fieldset>
      {op.feedback}
    </form>
  );
}
function AssignmentsPage() {
  const api = schoolApi(useApiClient());
  const teachers = useSchoolPage(['accounts', 'teacher', ''], (c, s) =>
    api.accounts('teacher', '', c, s),
  );
  const classes = useSchoolPage(['classes'], api.classes);
  const subjects = useSchoolPage(['subjects'], api.subjects);
  const list = useSchoolPage(['assignments'], api.assignments);
  const op = useSchoolOperation();
  const [teacherId, setTeacher] = useState('');
  const [classId, setClass] = useState('');
  const [subjectId, setSubject] = useState('');
  const [reason, setReason] = useState('');
  return (
    <div className="space-y-5">
      <form
        className={`${panel} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          const body = { teacherId, classId, subjectId, reason: reason.trim() };
          void op.run(JSON.stringify(body), (key) => api.assign(body, key));
        }}
      >
        <h2 className="text-xl font-semibold">Assign a teacher</h2>
        <fieldset disabled={op.pending} className="space-y-3">
          <Field label="Teacher">
            <select
              className={control}
              required
              value={teacherId}
              onChange={(e) => setTeacher(e.target.value)}
            >
              <option value="">Choose a teacher</option>
              {teachers.rows
                .filter((a) => a.status === 'active')
                .map((a) => (
                  <option key={a.userId} value={a.userId}>
                    {a.displayName} · {a.loginId}
                  </option>
                ))}
            </select>
          </Field>
          {teachers.controls}
          <Field label="Class">
            <select
              className={control}
              required
              value={classId}
              onChange={(e) => setClass(e.target.value)}
            >
              <option value="">Choose a class</option>
              {classes.rows
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.classId} value={a.classId}>
                    {a.name} · {a.academicYear}
                  </option>
                ))}
            </select>
          </Field>
          {classes.controls}
          <Field label="Subject">
            <select
              className={control}
              required
              value={subjectId}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="">Choose a subject</option>
              {subjects.rows
                .filter((a) => a.active)
                .map((a) => (
                  <option key={a.subjectId} value={a.subjectId}>
                    {a.name} · {a.code}
                  </option>
                ))}
            </select>
          </Field>
          {subjects.controls}
          <Reason value={reason} onChange={setReason} />
          <Button disabled={!teacherId || !classId || !subjectId || !reason.trim()}>
            Save assignment
          </Button>
        </fieldset>
        {op.feedback}
      </form>
      {list.controls}
      {list.rows.map((a) => (
        <AssignmentRow key={`${a.assignmentId}:${a.revision}`} assignment={a} />
      ))}
      {!list.query.isPending && !list.rows.length && !list.query.error && (
        <p>No teaching assignments yet.</p>
      )}
    </div>
  );
}
function AssignmentRow({ assignment: a }: { assignment: import('./schemas').Assignment }) {
  const api = schoolApi(useApiClient());
  const op = useSchoolOperation();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');
  return (
    <section className={`${panel} space-y-3`}>
      <h3 className="font-semibold">
        {a.teacherName} · {a.className} · {a.subjectName}
      </h3>
      <p>{a.active ? 'Active' : 'Inactive'}</p>
      <Button variant="outline" onClick={() => setEditing(!editing)}>
        {a.active ? 'Deactivate assignment' : 'Reactivate assignment'}
      </Button>
      {editing && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const body = { revision: a.revision, active: !a.active, reason: reason.trim() };
            void op.run(JSON.stringify([a.assignmentId, body]), (key) =>
              api.setAssignment(a.assignmentId, body, key),
            );
          }}
        >
          <Reason value={reason} onChange={setReason} />
          <Button disabled={op.pending || !reason.trim()}>Confirm assignment change</Button>
        </form>
      )}
      {op.feedback}
    </section>
  );
}
function AuditPage() {
  const api = schoolApi(useApiClient());
  const list = useSchoolPage(['audit'], api.audit);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">School setup activity</h2>
      {list.controls}
      {list.rows.map((a) => (
        <article className={`${panel} space-y-2`} key={a.auditId}>
          <p className="font-semibold capitalize">{a.action.replaceAll('_', ' ')}</p>
          <p>{a.targetLabel}</p>
          <p>
            {a.actorName} · {eatTime(a.at)}
          </p>
          <p className="whitespace-pre-wrap">{a.reason}</p>
        </article>
      ))}
      {!list.query.isPending && !list.rows.length && !list.query.error && (
        <p>No school setup changes recorded yet.</p>
      )}
    </div>
  );
}
export function SchoolSetupPage() {
  const [issue, setIssue] = useState<CredentialIssue | null>(null);
  const [tab, setTab] = useState('classes');
  const blocker = useBlocker(!!issue?.credentials);
  useBeforeUnload(
    useCallback(
      (e) => {
        if (issue?.credentials) e.preventDefault();
      },
      [issue],
    ),
  );
  return (
    <div className="space-y-6 [&_button]:h-auto [&_button]:min-h-11 [&_button]:max-w-full [&_button]:whitespace-normal [&_h3]:break-words [&_p]:break-words">
      <h1 className="text-3xl font-semibold">School setup</h1>
      <p>
        Manage classes, subjects, school accounts and teaching assignments. Student passwords are
        issued once and reset when lost.
      </p>
      {issue ? (
        <CredentialPanel key={issue.issueId} issue={issue} close={() => setIssue(null)} />
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 grid w-full grid-cols-2 gap-1 group-data-horizontal/tabs:h-auto sm:grid-cols-3 xl:grid-cols-6">
            {[
              ['classes', 'Classes'],
              ['subjects', 'Subjects'],
              ['accounts', 'Accounts'],
              ['assignments', 'Assignments'],
              ['roster', 'Roster import'],
              ['activity', 'Activity'],
            ].map(([value, label]) => (
              <TabsTrigger className="h-auto min-h-11" key={value} value={value ?? ''}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="classes">
            <StructurePage kind="class" />
          </TabsContent>
          <TabsContent value="subjects">
            <StructurePage kind="subject" />
          </TabsContent>
          <TabsContent value="accounts">
            <AccountsPage showIssue={setIssue} />
          </TabsContent>
          <TabsContent value="assignments">
            <AssignmentsPage />
          </TabsContent>
          <TabsContent value="roster">
            <RosterImport />
          </TabsContent>
          <TabsContent value="activity">
            <AuditPage />
          </TabsContent>
        </Tabs>
      )}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
        title="Leave the credential list?"
        description="This clears the one-time passwords from this view. If you have not saved them, reset the affected accounts later."
        confirmLabel="Discard list and leave"
        onConfirm={() => {
          setIssue(null);
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </div>
  );
}
