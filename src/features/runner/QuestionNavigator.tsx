import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';

export function QuestionNavigator({
  items,
  answers,
  index,
  onSelect,
}: {
  items: { itemId: string }[];
  answers: { itemId: string; value: string | null }[];
  index: number;
  onSelect: (index: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const answered = new Set(answers.filter((a) => a.value !== null).map((a) => a.itemId));
  const count = items.filter((item) => answered.has(item.itemId)).length;
  return (
    <section className="rounded-xl border bg-background p-4" aria-label="Question navigator">
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
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Hide question numbers' : 'Show question numbers'}
        </Button>
      </div>
      <nav id={id} aria-label="Questions" hidden={!expanded}>
        <div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-y-auto p-1">
          {items.map((question, position) => (
            <Button
              type="button"
              key={question.itemId}
              variant={position === index ? 'default' : 'outline'}
              className="min-h-11 min-w-11"
              aria-current={position === index ? 'step' : undefined}
              aria-label={`Question ${position + 1}, ${answered.has(question.itemId) ? 'answered' : 'unanswered'}`}
              onClick={() => onSelect(position)}
            >
              {position + 1}
              {answered.has(question.itemId) ? ' ✓' : ''}
            </Button>
          ))}
        </div>
      </nav>
    </section>
  );
}
