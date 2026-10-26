import { toDataURL } from 'qrcode';
import { writeFileSync, unlinkSync } from 'fs';
import { join, isAbsolute } from 'path';
import { randomUUID } from 'crypto';
import { execFileSync } from 'child_process';

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
export async function enrollmentHtml(loginId: string, secret: string) {
  const uri = `otpauth://totp/${encodeURIComponent(`NexoraOwner:${loginId}`)}?secret=${secret}&issuer=NexoraOwner&algorithm=SHA1&digits=6&period=30`;
  const image = await toDataURL(uri, { width: 320, margin: 3 });
  return `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>New owner authenticator setup</title><style>body{font:18px system-ui;max-width:640px;margin:32px auto;padding:20px}code{overflow-wrap:anywhere}img{max-width:100%}</style><h1>New setup: ${escape(loginId)}</h1><p>This replaces all earlier authenticator entries for this account. Keep this page private.</p><img alt="Scan this new QR in your authenticator" src="${image}"><p>Or enter this manual key:</p><code>${escape(secret)}</code><p>Enter the six-digit code from this NEW entry in your waiting terminal. The account is activated only when the terminal says Owner active. You have five minutes and five attempts.</p>`;
}
export async function showEnrollmentPage(loginId: string, secret: string): Promise<() => void> {
  const directory = process.env.OWNER_ENROLLMENT_DIRECTORY;
  if (!directory) return () => {};
  if (!isAbsolute(directory)) throw new Error('Enrollment directory must be absolute');
  const file = join(directory, `owner-setup-${randomUUID()}.html`);
  writeFileSync(file, await enrollmentHtml(loginId, secret), { flag: 'wx', mode: 0o600 });
  process.stdout.write(`Private setup page: ${file}\n`);
  if (process.platform === 'win32') {
    try {
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', 'Start-Process -FilePath $env.NEXORA_ENROLLMENT_PAGE'],
        {
          env: { ...process.env, NEXORA_ENROLLMENT_PAGE: file },
          windowsHide: true,
          stdio: 'ignore',
        },
      );
    } catch {
      process.stdout.write('Open the private setup page shown above manually.\n');
    }
  }
  return () => {
    try {
      unlinkSync(file);
    } catch {
      process.stderr.write('Remove the private setup page after enrollment.\n');
    }
  };
}
