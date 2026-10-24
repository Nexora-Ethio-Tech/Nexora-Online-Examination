import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { z } from 'zod';
import { useApiClient } from '@/lib/ApiProvider';
import { errorMessage } from '@/lib/api-client';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/button';

const statusSchema = z.object({ enrolled: z.boolean(), selfSetupAllowed: z.boolean() });
const setupSchema = z.object({
  secret: z.string(),
  otpauthUri: z.string(),
  expiresAt: z.string().datetime(),
});

export function StaffAuthenticator() {
  const client = useApiClient();
  const { session } = useAuth();
  const status = useQuery({
    queryKey: ['staff-authenticator', session?.school.id, session?.user.id],
    queryFn: ({ signal }) => client.request('/assistance/authenticator', statusSchema, { signal }),
  });
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; qr: string; expiresAt: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!setup) return;
    const timer = setTimeout(
      () => {
        setSetup(null);
        setCode('');
        setMessage('Setup expired. Start again if you have not confirmed your code.');
      },
      Math.max(0, Date.parse(setup.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [setup]);
  async function begin() {
    setBusy(true);
    setMessage('');
    const submitted = password;
    setPassword('');
    try {
      // Secret-bearing responses stay in component memory, outside query/mutation caches.
      const value = await client.request('/assistance/authenticator/setup', setupSchema, {
        method: 'POST',
        body: { password: submitted },
      });
      const qr = await QRCode.toDataURL(value.otpauthUri, { width: 240, margin: 2 });
      setSetup({ secret: value.secret, qr, expiresAt: value.expiresAt });
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setMessage('');
    const submitted = code;
    setCode('');
    try {
      await client.request('/assistance/authenticator/confirm', statusSchema, {
        method: 'POST',
        body: { code: submitted },
      });
      setSetup(null);
      setMessage('Authenticator ready. Wait for a fresh code before approving a student request.');
      await status.refetch();
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Your authenticator" className="space-y-3 rounded-xl border p-4">
      <h2 data-tour="authenticator-heading" className="text-lg font-semibold">
        Your authenticator
      </h2>
      <p>
        Get your six-digit code from the Nexora account in Microsoft or Google Authenticator on your
        phone. Enter it only on your own staff device. Codes work on the phone offline; approving a
        request still needs a connection.
      </p>
      {status.isPending && <p role="status">Checking authenticator setup…</p>}
      {status.error && (
        <>
          <p role="alert">{errorMessage(status.error)}</p>
          <Button onClick={() => void status.refetch()}>Retry authenticator status</Button>
        </>
      )}
      {status.data?.enrolled && (
        <p>
          Authenticator ready. Lost access? Ask your school administrator to arrange verified
          account recovery.
        </p>
      )}
      {status.data && !status.data.enrolled && !status.data.selfSetupAllowed && (
        <p>Contact your school administrator for protected authenticator enrollment.</p>
      )}
      {status.data?.selfSetupAllowed && !setup && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void begin();
          }}
        >
          <label className="block">
            Confirm your password
            <input
              type="password"
              autoComplete="current-password"
              className="mt-1 block min-h-11 w-full rounded border bg-background p-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          </label>
          <Button data-tour="authenticator-setup" disabled={busy || !password}>
            Set up authenticator
          </Button>
        </form>
      )}
      {setup && (
        <div className="space-y-3">
          <p>
            In Microsoft Authenticator, add an Other account and scan this QR code. Keep this QR
            code and setup key private. Confirm within five minutes.
          </p>
          <img
            src={setup.qr}
            width={240}
            height={240}
            alt="Your private Nexora authenticator setup QR code"
          />
          <details>
            <summary>Cannot scan? Enter the setup key</summary>
            <code className="break-all">{setup.secret}</code>
            <p>Choose time-based codes, six digits, 30 seconds.</p>
          </details>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void confirm();
            }}
          >
            <label className="block">
              Authenticator setup code
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                className="mt-1 block min-h-11 rounded border bg-background p-2"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                disabled={busy}
              />
            </label>
            <Button disabled={busy || !/^\d{6}$/.test(code)}>Confirm authenticator</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSetup(null);
                setCode('');
              }}
            >
              Hide setup
            </Button>
          </form>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
