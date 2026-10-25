import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import QRCode from 'qrcode';
import { z } from 'zod';
import { useApiClient } from '@/lib/ApiProvider';
import { errorMessage } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
export function AdminEnrollmentPage() {
  const client = useApiClient();
  const [token] = useState(() => window.location.hash.slice(1));
  const [loginId, setLoginId] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState('');
  const [setup, setSetup] = useState<{ secret: string; qr: string; expiresAt: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [done, setDone] = useState(false);
  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  useEffect(() => {
    if (!setup) return;
    const timer = setTimeout(
      () => {
        setSetup(null);
        setPassword('');
        setMessage('Setup expired. Reopen your invitation and start again.');
      },
      Math.max(0, Date.parse(setup.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [setup]);
  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      const csrf = await client.request('/auth/csrf', z.object({ csrfToken: z.string() }), {
        notifyUnauthorized: false,
      });
      client.setCsrfToken(csrf.csrfToken);
      if (!setup) {
        const data = await client.request(
          '/auth/admin-enrollment/begin',
          z.object({ secret: z.string(), otpauthUri: z.string(), expiresAt: z.string() }),
          { method: 'POST', body: { token, loginId, password }, notifyUnauthorized: false },
        );
        setSetup({
          ...data,
          qr: await QRCode.toDataURL(data.otpauthUri, { width: 240, margin: 2 }),
        });
      } else {
        await client.request(
          '/auth/admin-enrollment/confirm',
          z.object({ enrolled: z.boolean() }),
          { method: 'POST', body: { token, loginId, password, code }, notifyUnauthorized: false },
        );
        setSetup(null);
        setPassword('');
        setDone(true);
      }
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setCode('');
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Set up your administrator authenticator</h1>
      {done ? (
        <p>
          Authenticator connected. Wait for a fresh code, then{' '}
          <Link className="underline" to="/login">
            sign in
          </Link>
          .
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p>
            Use the login ID and initial password provided by the platform owner. This invitation
            expires after 30 minutes.
          </p>
          <label className="block">
            User ID
            <input
              className="block w-full rounded border p-3"
              required
              value={loginId}
              disabled={!!setup}
              onChange={(e) => setLoginId(e.target.value)}
            />
          </label>
          <label className="block">
            Password
            <input
              className="block w-full rounded border p-3"
              required
              type="password"
              value={password}
              disabled={!!setup}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {setup && (
            <>
              <img
                src={setup.qr}
                alt="Scan with Microsoft Authenticator"
                width={240}
                height={240}
              />
              <p>Cannot scan? Add an Other account and enter this setup key:</p>
              <code className="break-all">{setup.secret}</code>
              <label className="block">
                Six-digit authenticator code
                <input
                  className="block w-full rounded border p-3"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </label>
            </>
          )}
          <Button disabled={busy || !token}>
            {setup ? 'Confirm authenticator' : 'Show my QR code'}
          </Button>
          {!token && <p>Open the private invitation provided by your platform owner.</p>}
        </form>
      )}
      {message && <p role="alert">{message}</p>}
    </main>
  );
}
