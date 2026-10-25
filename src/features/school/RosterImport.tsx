import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { control, panel } from '@/features/exams/authoring/TeacherPage';
import { eatTime } from '@/features/exams/ExamsPage';
import { schoolApi } from './api';
import type { RosterPreview } from './schemas';
import { Field, Reason, useSchoolOperation, useSchoolPage } from './SchoolSetupPage';

export function RosterImport() {
  const api = schoolApi(useApiClient());
  const classes = useSchoolPage(['classes'], api.classes);
  const op = useSchoolOperation();
  const commit = useSchoolOperation();
  const [classId, setClassId] = useState('');
  const [file, setFile] = useState<{ file: File; token: string } | null>(null);
  const [preview, setPreview] = useState<RosterPreview | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [limit, setLimit] = useState(25);
  const [created, setCreated] = useState<number | null>(null);
  function resetPreview() {
    setPreview(null);
    setConfirmed(false);
    setCreated(null);
    setLimit(25);
  }
  return (
    <div className="space-y-5">
      <form
        className={`${panel} space-y-4`}
        onSubmit={(e) => {
          e.preventDefault();
          if (file && classId)
            void op.run(
              JSON.stringify([file.token, classId]),
              (key) => api.preview(file.file, classId, key),
              (value) => {
                setPreview(value);
                setConfirmed(false);
                setCreated(null);
                setLimit(25);
              },
            );
        }}
      >
        <h2 className="text-xl font-semibold">Import a student roster</h2>
        <p>
          Choose a class and upload Excel or CSV with First name, Father's name and Grandfather's
          name. Roll number is optional and goes first. Nexora generates login IDs; roll numbers are
          not login IDs. Without roll numbers, check Accounts before importing a changed file again
          to avoid duplicate students.
        </p>
        <a
          className="inline-flex min-h-11 items-center underline"
          href="/templates/nexora-student-roster.xlsx"
          download
        >
          Download roster Excel example
        </a>
        <fieldset disabled={op.pending || commit.pending} className="space-y-3">
          <Field label="Roster class">
            <select
              className={control}
              required
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                resetPreview();
              }}
            >
              <option value="">Choose a class</option>
              {classes.rows
                .filter((c) => c.active)
                .map((c) => (
                  <option key={c.classId} value={c.classId}>
                    {c.name} · {c.academicYear}
                  </option>
                ))}
            </select>
          </Field>
          {classes.controls}
          <Field label="Student roster file">
            <input
              className={control}
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              onChange={(e) => {
                const selected = e.target.files?.[0];
                setFile(selected ? { file: selected, token: crypto.randomUUID() } : null);
                resetPreview();
              }}
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Up to 2 MiB and 2,000 rows per file. Import additional files for larger rosters.
          </p>
          <Button className="min-h-11" disabled={!file || !classId}>
            {op.pending ? 'Checking roster…' : 'Preview roster'}
          </Button>
        </fieldset>
        {op.feedback}
      </form>
      {preview && (
        <section className={`${panel} space-y-4`}>
          <h2 className="text-xl font-semibold">Roster preview: {preview.className}</h2>
          <p>
            {preview.totalRows} students · expires {eatTime(preview.expiresAt)}
          </p>
          <p>
            {preview.canCommit
              ? 'All rows passed validation. Review the names and class before importing.'
              : 'Correct the errors in your file and upload it again. No accounts have been created.'}
          </p>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Student roster validation</caption>
              <thead>
                <tr>
                  <th className="p-2">Row</th>
                  <th className="p-2">Roll number (optional)</th>
                  <th className="p-2">Student name</th>
                  <th className="p-2">Validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, limit).map((r) => (
                  <tr key={r.row} className="border-t">
                    <td className="p-2">{r.row}</td>
                    <td className="p-2">{r.rollNumber || '—'}</td>
                    <td className="p-2">{r.displayName}</td>
                    <td className="p-2">
                      {r.errors.length
                        ? r.errors.map((v, i) => (
                            <p className="text-destructive" key={i}>
                              {v.field}: {v.message}
                            </p>
                          ))
                        : 'Ready'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {limit < preview.rows.length && (
            <Button variant="outline" onClick={() => setLimit(limit + 25)}>
              Show more preview rows
            </Button>
          )}
          {created !== null ? (
            <p role="status">
              Imported {created} students. Open Accounts, choose their class, and create their login
              details. Existing exam rosters were preserved.
            </p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (confirmed && preview.canCommit)
                  void commit.run(
                    JSON.stringify([preview.importId, preview.revision, reason]),
                    (key) => api.commit(preview.importId, preview.revision, reason.trim(), key),
                    (result) => setCreated(result.createdCount),
                  );
              }}
            >
              <fieldset disabled={commit.pending || !preview.canCommit} className="space-y-3">
                <Reason value={reason} onChange={setReason} />
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  I checked every row and the intended class.
                </label>
                <Button className="min-h-11" disabled={!confirmed || !reason.trim()}>
                  Import validated students
                </Button>
              </fieldset>
            </form>
          )}
          {commit.feedback}
        </section>
      )}
    </div>
  );
}
