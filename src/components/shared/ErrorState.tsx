import { Button } from '@/components/ui/button';

type Props = {
  message: string;
  onRetry?: () => void;
};

export function ErrorState({ message, onRetry }: Props) {
  return (
    <div
      role="alert"
      className="border-destructive/40 flex flex-col items-center justify-center gap-3 rounded-lg border px-6 py-12 text-center"
    >
      <p className="text-sm">{message}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
