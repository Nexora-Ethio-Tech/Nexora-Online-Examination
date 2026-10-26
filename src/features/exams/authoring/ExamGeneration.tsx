import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useApiClient } from '@/lib/ApiProvider';
import { schoolApi } from '@/features/school/api';
import { control, Failure, panel, useTeacherScope } from './TeacherPage';
import { generationInputSchema, type GenerationInput } from './generation-schemas';

export function ExamGeneration({
  revision,
  itemCount,
  disabled,
  onGenerate,
}: {
  revision: number;
  itemCount: number;
  disabled: boolean;
  onGenerate: (body: GenerationInput) => void;
}) {
  const api = schoolApi(useApiClient());
  const scope = useTeacherScope();
  const settings = useQuery({
    queryKey: ['school', ...scope, 'ai-exam-settings'],
    queryFn: ({ signal }) => api.aiSettings(signal),
    refetchInterval: 15000,
  });
  const [topics, setTopics] = useState('');
  const [guidance, setGuidance] = useState('');
  const [difficulty, setDifficulty] = useState<GenerationInput['difficulty']>('mixed');
  const [mcqCount, setMcqCount] = useState(10);
  const [trueFalseCount, setTrueFalseCount] = useState(0);
  const [marks, setMarks] = useState(1);
  const [replace, setReplace] = useState(false);
  const [error, setError] = useState('');
  if (settings.isPending) return <p role="status">Checking school AI generation setting…</p>;
  if (settings.error)
    return (
      <section className={panel}>
        <Failure error={settings.error} />
        <Button variant="outline" onClick={() => void settings.refetch()}>
          Retry AI setting
        </Button>
      </section>
    );
  if (!settings.data?.aiExamGenerationEnabled)
    return (
      <p className="text-sm text-muted-foreground">
        Your school administrator can enable AI exam generation. You can upload a paper below.
      </p>
    );
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(event) => {
        event.preventDefault();
        const result = generationInputSchema.safeParse({
          revision,
          topics,
          guidance,
          difficulty,
          mcqCount,
          trueFalseCount,
          marksPerQuestion: marks,
          replaceExisting: itemCount > 0 && replace,
        });
        if (!result.success) {
          setError(result.error.issues.map((i) => i.message).join(' '));
          return;
        }
        if (itemCount > 0 && !replace) {
          setError('Confirm replacing the existing questions.');
          return;
        }
        setError('');
        onGenerate(result.data);
      }}
    >
      <h2 className="text-xl font-semibold">Generate an exam with AI</h2>
      <p className="text-sm text-muted-foreground">
        Uses the subject, class and language saved in Exam details. Review every generated question,
        answer and explanation before submitting for administrator approval. Uploading remains
        available below.
      </p>
      {import.meta.env.DEV &&
        (import.meta.env.MODE === 'demo' || import.meta.env.VITE_USE_MOCKS === 'true') && (
          <p className="text-sm">
            Demo: generation uses synthetic mathematics examples, not a live AI provider.
          </p>
        )}
      <fieldset disabled={disabled} className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="field-label">Topics and syllabus coverage</span>
          <textarea
            required
            maxLength={4000}
            rows={3}
            className={control}
            value={topics}
            onChange={(e) => {
              setTopics(e.target.value);
              setReplace(false);
            }}
          />
        </label>
        <label className="block text-sm">
          <span className="field-label">Difficulty</span>
          <select
            required
            className={control}
            value={difficulty}
            onChange={(e) => {
              const value = e.target.value;
              if (value === 'easy' || value === 'medium' || value === 'hard' || value === 'mixed')
                setDifficulty(value);
            }}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="field-label">Marks per question</span>
          <Input
            type="number"
            required
            min={1}
            max={100}
            value={marks}
            onChange={(e) => setMarks(e.target.valueAsNumber)}
          />
        </label>
        <label className="block text-sm">
          <span className="field-label">Multiple-choice questions</span>
          <Input
            type="number"
            required
            min={0}
            max={50}
            value={mcqCount}
            onChange={(e) => setMcqCount(e.target.valueAsNumber)}
          />
        </label>
        <label className="block text-sm">
          <span className="field-label">True/false questions</span>
          <Input
            type="number"
            required
            min={0}
            max={50}
            value={trueFalseCount}
            onChange={(e) => setTrueFalseCount(e.target.valueAsNumber)}
          />
        </label>
        <p className="text-sm sm:col-span-2">
          Up to 50 questions. Total marks:{' '}
          {Number.isFinite((mcqCount + trueFalseCount) * marks)
            ? (mcqCount + trueFalseCount) * marks
            : '—'}
        </p>
        <label className="block text-sm sm:col-span-2">
          <span className="field-label">Additional guidance (optional)</span>
          <textarea
            maxLength={4000}
            rows={3}
            className={control}
            value={guidance}
            onChange={(e) => setGuidance(e.target.value)}
          />
        </label>
        {itemCount > 0 && (
          <label className="flex gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            Replace all existing questions and reset their reviews only after generation succeeds.
          </label>
        )}
        <Button className="min-h-11" disabled={!topics.trim() || (itemCount > 0 && !replace)}>
          Generate exam draft
        </Button>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
