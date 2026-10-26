import { XIcon } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** Short contextual editor. Accidental dismissal preserves work until explicitly discarded. */
export function EditDialog({
  title,
  children,
  close,
  locked = false,
  protectChanges = true,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  locked?: boolean;
  protectChanges?: boolean;
}) {
  const dirty = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState(false);
  const [opener] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  function dismiss() {
    if (locked || content.current?.querySelector('[data-saving="true"]')) return;
    if (protectChanges && dirty.current) setConfirm(true);
    else close();
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <DialogContent
        ref={content}
        showCloseButton={false}
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onInteractOutside={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener?.isConnected) opener.focus();
          else document.querySelector<HTMLElement>('#main-content')?.focus();
        }}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2 size-11"
          aria-label="Close"
          disabled={locked}
          onClick={dismiss}
        >
          <XIcon aria-hidden="true" />
        </Button>
        <DialogTitle className="pr-12">{title}</DialogTitle>
        <DialogDescription>Fields marked * are required.</DialogDescription>
        {confirm ? (
          <div className="space-y-3" role="alert">
            <p>Discard your unsaved changes?</p>
            <Button type="button" variant="outline" onClick={() => setConfirm(false)}>
              Keep editing
            </Button>{' '}
            <Button
              type="button"
              variant="destructive"
              disabled={locked}
              onClick={() => {
                if (!content.current?.querySelector('[data-saving="true"]')) close();
              }}
            >
              Discard changes
            </Button>
          </div>
        ) : null}
        <div
          onChangeCapture={() => {
            dirty.current = true;
          }}
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}
