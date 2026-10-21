import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/lib/ApiProvider';
import { ApiError } from '@/lib/api-client';
import { examApi } from './api';
import { retainedId, replaceBrowserId } from './storage';
import { panel, Failure } from './authoring/TeacherPage';

export function DevicePage() {
  const api = examApi(useApiClient());
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  const [id, setId] = useState<string | null>(null);
  const [rejectedId, setRejectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function register(replace?: string) {
    if (pending) return;
    const controller = new AbortController();
    operation.current = controller;
    setPending(true);
    setError(null);
    setId(null);
    let deviceId: string | undefined;
    try {
      deviceId = replace ? await replaceBrowserId(replace) : await retainedId('browser-device');
      controller.signal.throwIfAborted();
      const response = await api.enroll(deviceId, controller.signal);
      if (response.deviceId !== deviceId)
        throw new ApiError(
          'INVALID_RESPONSE',
          'The registered ID did not match this browser. Contact school staff.',
        );
      if (!controller.signal.aborted) {
        setId(deviceId);
        setRejectedId(null);
        setConfirmed(false);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setError(
          err instanceof ApiError
            ? err
            : new ApiError(
                'DEVICE_STORAGE',
                'Browser storage could not be updated. Keep existing exam work and try registration again.',
              ),
        );
        setRejectedId(
          err instanceof ApiError && err.code === 'DEVICE_REPLACED' ? (deviceId ?? null) : null,
        );
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <Link to="/student" className="inline-flex min-h-11 items-center underline">
        Back to My exams
      </Link>
      <h1 className="text-3xl font-semibold">Register replacement browser</h1>
      <section className={`${panel} space-y-4`}>
        <p>
          Use this on the browser you intend to continue with. Check that you are signed in with
          your own student account.
        </p>
        <p className="text-sm text-muted-foreground">
          Registration gives school staff a browser ID. An administrator must approve moving an
          existing attempt. Your original deadline stays the same and only answers already received
          by your school can be restored automatically. Keep the old browser’s saved work.
        </p>
        <Failure error={error} />
        {!rejectedId && (
          <Button className="min-h-11" disabled={pending} onClick={() => void register()}>
            {pending
              ? 'Registering browser…'
              : id
                ? 'Verify browser registration'
                : 'Register this browser'}
          </Button>
        )}
        {rejectedId && (
          <div className="space-y-4">
            <p className="text-sm">
              This browser is no longer registered. Register it again, then ask your administrator
              to approve it. This keeps your saved answers and exam download, but the old browser ID
              will no longer be used here.
            </p>
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                disabled={pending}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I need a new browser registration and will ask school staff to approve the
              replacement.
            </label>
            <Button disabled={!confirmed || pending} onClick={() => void register(rejectedId)}>
              {pending ? 'Creating registration…' : 'Create new browser registration'}
            </Button>
          </div>
        )}
        {id && (
          <div role="status" className="space-y-3 rounded-lg bg-muted p-4">
            <h2 className="font-semibold">Browser registered</h2>
            <p className="text-sm">Show this ID to school staff together with your student ID:</p>
            <p
              className="select-all break-all font-mono text-sm"
              aria-label="Registered browser ID"
            >
              {id}
            </p>
            <p className="text-sm">
              After approval, return to My exams and open your exam. Stay connected while it opens.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
