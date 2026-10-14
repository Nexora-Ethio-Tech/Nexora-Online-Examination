import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useBeforeUnload, useParams } from 'react-router';
import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useApiClient } from '@/lib/ApiProvider';
import { authoringApi } from './api';
import { itemSchema, reviewProblems, type Item } from './schemas';
import {
  control,
  panel,
  Failure,
  MetadataForm,
  useAssignments,
  useTeacherScope,
} from './TeacherPage';

function ItemReview({
  item,
  disabled,
  onSave,
  onDirty,
}: {
  item: Item;
  disabled: boolean;
  onSave: (item: Item) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const [edit, setEdit] = useState(item);
  const [validation, setValidation] = useState('');
  function change(next: Item) {
    setEdit(next);
    onDirty(JSON.stringify(next) !== JSON.stringify(item));
  }
  function save() {
    const parsed = itemSchema.safeParse(edit);
    if (!parsed.success) {
      setValidation(parsed.error.issues.map((i) => i.message).join(' '));
      return;
    }
    setValidation('');
    onSave(parsed.data);
  }
  return (
    <section className={panel}>
      <div className="mb-4 flex justify-between gap-3">
        <h3 className="font-semibold">{item.externalId}</h3>
        <span className="text-sm">{item.reviewed ? 'Reviewed' : 'Needs review'}</span>
      </div>
      <fieldset disabled={disabled} className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Teacher question and answer</h4>
          <label className="block text-sm">
            Question
            <textarea
              className={control}
              rows={3}
              value={edit.stem}
              onChange={(e) => change({ ...edit, stem: e.target.value, reviewed: false })}
            />
          </label>
          {edit.options.map((o, i) => (
            <label key={o.id} className="block text-sm">
              Option {o.id}
              <Input
                value={o.text}
                onChange={(e) =>
                  change({
                    ...edit,
                    reviewed: false,
                    options: edit.options.map((v, j) =>
                      j === i ? { ...v, text: e.target.value } : v,
                    ),
                  })
                }
              />
            </label>
          ))}
          <label className="block text-sm">
            Correct answer
            <select
              className={control}
              value={edit.correctOptionId}
              onChange={(e) =>
                change({ ...edit, correctOptionId: e.target.value, reviewed: false })
              }
            >
              {edit.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id}: {o.text}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Marks
            <Input
              type="number"
              value={edit.marks}
              onChange={(e) => change({ ...edit, marks: e.target.valueAsNumber, reviewed: false })}
            />
          </label>
        </div>
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Topic and explanation review</h4>
          <p className="text-xs text-muted-foreground">
            AI suggestions require your review. Changing the key never updates the explanation
            automatically.
          </p>
          {(item.keyConsistent === false || item.reviewFlags.length > 0) && (
            <p className="rounded-md border border-amber-500 p-3 text-sm">
              Flagged for review: {item.keyConsistent === false ? 'Answer-key conflict. ' : ''}
              {item.reviewFlags.join('; ')}
            </p>
          )}
          <label className="block text-sm">
            Primary topic
            <Input
              value={edit.primaryTopic}
              onChange={(e) => change({ ...edit, primaryTopic: e.target.value, reviewed: false })}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Secondary topics: {item.secondaryTopics.join(', ') || 'None'}
          </p>
          <label className="block text-sm">
            Explanation
            <textarea
              rows={6}
              className={control}
              value={edit.explanation}
              onChange={(e) => change({ ...edit, explanation: e.target.value, reviewed: false })}
            />
          </label>
          <label className="block text-sm">
            Review note / flag resolution
            <textarea
              rows={2}
              className={control}
              value={edit.reviewNote}
              onChange={(e) => change({ ...edit, reviewNote: e.target.value })}
            />
          </label>
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={edit.reviewed}
              onChange={(e) => change({ ...edit, reviewed: e.target.checked })}
            />
            I checked the question, answer key, topic and explanation, and resolved any flags.
          </label>
          <Button type="button" onClick={save}>
            Save question review
          </Button>
        </div>
      </fieldset>
      {validation && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {validation}
        </p>
      )}
    </section>
  );
}

export function TeacherDetail() {
  const { examId = '' } = useParams();
  const api = authoringApi(useApiClient());
  const scope = useTeacherScope();
  const qc = useQueryClient();
  const assignments = useAssignments();
  const draftKey = ['teacher-exam', ...scope, examId];
  const itemsKey = ['teacher-items', ...scope, examId];
  const draft = useQuery({
    queryKey: draftKey,
    queryFn: ({ signal }) => api.get(examId, signal),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const items = useQuery({
    queryKey: itemsKey,
    queryFn: ({ signal }) => api.items(examId, signal),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const importId = draft.data?.importId;
  const job = useQuery({
    queryKey: ['teacher-import', ...scope, importId],
    queryFn: ({ signal }) => api.job(importId ?? '', signal),
    enabled: !!importId,
    refetchInterval: (query) =>
      query.state.data && ['ready', 'failed'].includes(query.state.data.state) ? false : 2000,
  });
  const jobState = job.data?.state;
  useEffect(() => {
    if (jobState === 'ready' || jobState === 'failed') {
      void qc.invalidateQueries({ queryKey: ['teacher-exam', ...scope, examId] });
      void qc.invalidateQueries({ queryKey: ['teacher-items', ...scope, examId] });
    }
  }, [jobState, qc, examId, scope]);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState('import');
  const [dirtyItems, setDirtyItems] = useState<Set<string>>(new Set());
  const [metadataDirty, setMetadataDirty] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const dirty = dirtyItems.size > 0 || metadataDirty;
  const blocker = useBlocker(dirty);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [dirty],
    ),
  );
  const retained = useRef(new Map<string, { body: string; key: string }>());
  function key(operation: string, body: unknown) {
    const serialized = JSON.stringify(body);
    const prior = retained.current.get(operation);
    if (prior?.body === serialized) return prior.key;
    const next = { body: serialized, key: crypto.randomUUID() };
    retained.current.set(operation, next);
    return next.key;
  }
  const action = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: draftKey }),
        qc.invalidateQueries({ queryKey: itemsKey }),
        qc.invalidateQueries({ queryKey: ['teacher-exams', ...scope] }),
        qc.invalidateQueries({ queryKey: ['teacher-import', ...scope] }),
      ]);
      setDirtyItems(new Set());
      setMetadataDirty(false);
      setMessage('Saved on the server.');
      setConfirmed(false);
    },
  });
  if (draft.isPending) return <p role="status">Opening exam draft…</p>;
  if (!draft.data)
    return (
      <>
        <Failure error={draft.error} />
        <Button onClick={() => void draft.refetch()}>Retry paper</Button>
      </>
    );
  const d = draft.data;
  const busy =
    !!importId && (!job.data || !!job.error || !['ready', 'failed'].includes(job.data.state));
  const editable = ['draft', 'returned'].includes(d.status);
  const disabled = !editable || busy || action.isPending;
  const paper = items.data?.items ?? [];
  const blockers = [
    ...(busy
      ? [
          'Wait for import and AI preparation to finish. If loading failed, retry loading the paper.',
        ]
      : []),
    ...(metadataDirty ? ['Save your changes in Exam details.'] : []),
    ...(dirtyItems.size ? ['Save the question review you are currently editing.'] : []),
    ...(items.error || draft.error ? ['Retry loading the paper before submitting.'] : []),
    ...(!paper.length ? ['Upload a question template before submitting.'] : []),
    ...reviewProblems(paper).map(
      (item) =>
        `${item.externalId}: ${item.reviewFlags.length || item.keyConsistent === false ? 'add a resolution note for the flag, then ' : ''}check the review confirmation and click Save question review.`,
    ),
    ...(items.data && items.data.revision !== d.revision
      ? ['The paper version changed. Reload the server version before submitting.']
      : []),
  ];
  const canSubmit =
    editable &&
    !busy &&
    !dirty &&
    !items.error &&
    !draft.error &&
    paper.length > 0 &&
    reviewProblems(paper).length === 0 &&
    items.data?.revision === d.revision;
  function run(fn: () => Promise<unknown>) {
    setMessage('');
    action.mutate(fn);
  }
  return (
    <div className="space-y-5">
      <Link className="text-sm underline" to="/teacher">
        Back to my papers
      </Link>
      <div>
        <p className="text-sm capitalize text-muted-foreground">
          {d.status.replace('_', ' ')} · Revision {d.revision}
        </p>
        <h1 className="mt-2 break-words text-3xl font-semibold">{d.title}</h1>
        <p className="mt-3 text-sm">
          {d.itemCount} questions · {d.totalMarks} total marks · {d.reviewedCount} reviewed · Pass{' '}
          {d.passPercent}%
        </p>
      </div>
      {d.returnComment && <p className={panel}>Administrator feedback: {d.returnComment}</p>}
      {!editable && (
        <p role="status" className={panel}>
          {d.status === 'in_review'
            ? 'Submitted for administrator approval. This paper is now read-only.'
            : 'Approved paper. Your administrator manages scheduling and release.'}
        </p>
      )}
      <Failure error={action.error || draft.error || items.error || job.error} />
      {action.error && (
        <Button
          variant="outline"
          onClick={() => {
            setDirtyItems(new Set());
            setMetadataDirty(false);
            setEditorEpoch((value) => value + 1);
            action.reset();
            void draft.refetch();
            void items.refetch();
            if (importId) void job.refetch();
          }}
        >
          Discard unsaved edits and reload server version
        </Button>
      )}
      {(draft.error || items.error || job.error) && (
        <Button
          onClick={() => {
            void draft.refetch();
            void items.refetch();
            if (importId) void job.refetch();
          }}
        >
          Retry loading paper
        </Button>
      )}
      {message && (
        <p role="status" className="text-sm text-primary">
          {message}
        </p>
      )}
      {blocker.state === 'blocked' && (
        <div role="alert" className={panel}>
          <p>You have unsaved edits.</p>
          <Button onClick={() => blocker.reset()}>Keep editing</Button>
          <Button variant="outline" onClick={() => blocker.proceed()}>
            Leave without saving
          </Button>
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          if (!dirty) setTab(value);
          else setMessage('Save your question edits before changing tabs.');
        }}
      >
        <TabsList className="mb-3 h-auto flex-wrap">
          <TabsTrigger value="details">Exam details</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
          <TabsTrigger value="review">Review questions</TabsTrigger>
        </TabsList>
        <TabsContent value="details" className={panel}>
          <MetadataForm
            onDirty={setMetadataDirty}
            key={`${d.revision}-${editorEpoch}`}
            initial={d}
            lockedContext={d.itemCount > 0}
            assignments={assignments.data?.pages.flatMap((p) => p.items) ?? []}
            pending={action.isPending}
            disabled={!editable || busy}
            onSave={(body) =>
              run(() =>
                api.save(examId, body, d.revision, key('metadata', { body, revision: d.revision })),
              )
            }
          />
          <Failure error={assignments.error} />
          {assignments.hasNextPage && (
            <Button onClick={() => void assignments.fetchNextPage()}>Load more assignments</Button>
          )}
        </TabsContent>
        <TabsContent value="import" className="space-y-4">
          <section className={panel}>
            <h2 className="text-xl font-semibold">Upload your question paper</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Use one simple table in Word or the Questions worksheet in Excel. Include your correct
              answers. Maximum 5 MB and 200 questions per import.
            </p>
            <div className="my-4 flex flex-wrap gap-3">
              <a className="text-sm underline" href="/templates/nexora-questions.docx" download>
                Download Word example
              </a>
              <a className="text-sm underline" href="/templates/nexora-questions.xlsx" download>
                Download Excel example
              </a>
            </div>
            {import.meta.env.DEV &&
              (import.meta.env.MODE === 'demo' || import.meta.env.VITE_USE_MOCKS === 'true') && (
                <p className="mb-4 rounded-md bg-muted p-3 text-sm">
                  Demo: upload an unchanged example from the links above. Parsing and AI are
                  simulated for these examples only; edited files require the real backend.
                </p>
              )}
            <label className="block text-sm">
              Question template
              <Input
                className="mt-2"
                type="file"
                accept=".docx,.xlsx"
                disabled={disabled}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setConfirmed(false);
                }}
              />
            </label>
            {d.itemCount > 0 && (
              <label className="my-3 flex gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Replace all questions and reset their reviews only if this import is valid.
              </label>
            )}
            <Button
              className="mt-4 min-h-11"
              disabled={disabled || !file || (d.itemCount > 0 && !confirmed)}
              onClick={() => {
                if (file) {
                  const selected = file;
                  run(() =>
                    api.upload(
                      examId,
                      d.revision,
                      selected,
                      key('upload', {
                        revision: d.revision,
                        name: selected.name,
                        size: selected.size,
                        modified: selected.lastModified,
                      }),
                    ),
                  );
                }
              }}
            >
              {action.isPending ? 'Uploading…' : 'Upload and prepare questions'}
            </Button>
          </section>
          {job.data && (
            <section className={panel}>
              <h2 className="font-semibold">{job.data.sourceName}</h2>
              <p role="status" className="my-2 capitalize">
                {job.data.state.replaceAll('_', ' ')} · {job.data.parsedCount} parsed ·{' '}
                {job.data.completedCount} AI suggestions ready
              </p>
              {busy && (
                <p className="text-sm">
                  Your draft is retained while processing. You can return to this paper later.
                </p>
              )}
              {job.data.failure && <p role="alert">{job.data.failure}</p>}
              {job.data.diagnostics.map((v, i) => (
                <p key={i} className="mt-2 text-sm">
                  Row {v.row}, {v.field}: {v.message}
                </p>
              ))}
              {job.data.state === 'failed' && job.data.parsedCount > 0 && (
                <Button
                  disabled={disabled}
                  onClick={() =>
                    run(() =>
                      api.retry(
                        job.data.importId,
                        d.revision,
                        key('retry', { id: job.data.importId, revision: d.revision }),
                      ),
                    )
                  }
                >
                  Retry AI preparation
                </Button>
              )}
              <Button variant="outline" className="mt-4" onClick={() => setTab('review')}>
                Review imported questions
              </Button>
            </section>
          )}
        </TabsContent>
        <TabsContent value="review" className="space-y-4">
          {items.isPending && <p role="status">Loading questions…</p>}
          {!items.isPending && paper.length === 0 && (
            <p className={panel}>
              Upload a question template first. Your parsed questions and supplied keys will appear
              here.
            </p>
          )}
          {busy && (
            <p role="status">AI preparation is running. Review opens when processing finishes.</p>
          )}
          {paper.map((item) => (
            <ItemReview
              key={`${item.itemId}-${items.data?.revision}-${editorEpoch}`}
              item={item}
              disabled={disabled || (dirty && !dirtyItems.has(item.itemId))}
              onDirty={(value) =>
                setDirtyItems((prior) => {
                  const next = new Set(prior);
                  if (value) next.add(item.itemId);
                  else next.delete(item.itemId);
                  return next;
                })
              }
              onSave={(value) => {
                if (dirtyItems.size > 1) {
                  setMessage(
                    'Save one question at a time. Reloading after a save would discard other unsaved edits.',
                  );
                  return;
                }
                run(() =>
                  api.saveItem(
                    examId,
                    value,
                    items.data?.revision ?? d.revision,
                    key('item', { value, revision: items.data?.revision }),
                  ),
                );
              }}
            />
          ))}
        </TabsContent>
      </Tabs>
      {editable && (
        <section className={panel}>
          <h2 className="font-semibold">Send to your administrator</h2>
          <p className="my-3 text-sm text-muted-foreground">
            Review and save every question, key, topic and explanation first. Submission locks this
            draft until your administrator returns it.
          </p>
          {blockers.length > 0 && (
            <div className="mb-4 rounded-lg bg-muted p-4 text-sm" role="status">
              <p className="font-medium">Before you can submit:</p>
              <ul className="mt-2 list-disc space-y-2 pl-5">
                {blockers.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {!dirty && paper.length > 0 && !busy && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 min-h-11"
                  onClick={() => setTab('review')}
                >
                  Go to question reviews
                </Button>
              )}
            </div>
          )}
          <Button
            className="min-h-11"
            disabled={!canSubmit || action.isPending}
            onClick={() => run(() => api.submit(examId, d.revision, key('submit', d.revision)))}
          >
            Submit for approval
          </Button>
        </section>
      )}
    </div>
  );
}
