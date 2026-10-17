import { useId, useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function QuestionNavigator({
  items,
  answers,
  index,
  onSelect,
  reviewItemIds = [],
}: {
  items: { itemId: string }[];
  answers: { itemId: string; value: string | null }[];
  index: number;
  onSelect: (index: number) => void;
  reviewItemIds?: string[];
}) {
  const [expanded, setExpanded] = useState(true);
  const id = useId();
  const [onlyMarked, setOnlyMarked] = useState(false);
  const answered = new Set(answers.filter((a) => a.value !== null).map((a) => a.itemId));
  const count = items.filter((item) => answered.has(item.itemId)).length;
  return (
    <section
      className="nexora-surface rounded-xl border bg-background p-4"
      aria-label="Question navigator"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <p className="font-medium">
            Question {index + 1} of {items.length}
          </p>
          <p className="mt-1 text-muted-foreground">
            {count} answered · {items.length - count} unanswered
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          aria-label={expanded ? 'Hide question numbers' : 'Show question numbers'}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide' : 'Show'}
        </Button>
      </div>
      <nav id={id} aria-label="Questions" hidden={!expanded}>
        {onlyMarked && !reviewItemIds.length && (
          <p className="text-sm">No questions marked for review.</p>
        )}
        <div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-y-auto p-1">
          {items.map(
            (question, position) =>
              (!onlyMarked || reviewItemIds.includes(question.itemId)) && (
                <Button
                  type="button"
                  key={question.itemId}
                  variant={position === index ? 'default' : 'outline'}
                  className={`min-h-11 min-w-11 ${position !== index && answered.has(question.itemId) ? 'border-primary/30 bg-secondary text-secondary-foreground' : ''} ${reviewItemIds.includes(question.itemId) ? 'ring-2 ring-amber-700 ring-offset-2' : ''}`}
                  aria-current={position === index ? 'step' : undefined}
                  aria-label={`Question ${position + 1}, ${answered.has(question.itemId) ? 'answered' : 'unanswered'}${reviewItemIds.includes(question.itemId) ? ', marked for review' : ''}`}
                  onClick={() => onSelect(position)}
                >
                  {position + 1}
                  {answered.has(question.itemId) ? ' ✓' : ''}
                  {reviewItemIds.includes(question.itemId) && (
                    <Flag className="size-3" aria-hidden="true" />
                  )}
                </Button>
              ),
          )}
        </div>
        <details className="mt-3 text-sm">
          <summary className="min-h-11 cursor-pointer py-3 text-muted-foreground">
            Review filters and status key
          </summary>{' '}
          <p className="mt-3 text-xs text-muted-foreground">
            Filled: current · ✓: answered · flag and outline: marked for review
          </p>
          <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyMarked}
              onChange={(e) => setOnlyMarked(e.target.checked)}
            />
            Show marked for review only ({reviewItemIds.length})
          </label>
        </details>
      </nav>
    </section>
  );
}
