import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

// Git remains required: a deployment SHA alone cannot attest source cleanliness.
export function releaseSource(cwd: string, env: NodeJS.ProcessEnv = process.env) {
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const head = git('rev-parse', 'HEAD').trim();
  const vercelCommit = env.VERCEL === '1' ? env.VERCEL_GIT_COMMIT_SHA : undefined;
  if (vercelCommit && (!/^[a-f\d]{40}$/i.test(vercelCommit) || vercelCommit.toLowerCase() !== head))
    throw new Error('Vercel deployment commit does not match Git HEAD.');

  const status = git('status', '--porcelain=v1', '-z', '--untracked-files=all');
  let dirty = status.length > 0;
  // Only an unstaged, content-only change to this exact tracked file is eligible.
  // Staged changes, renames, deletions, type changes and all other files stay dirty.
  if (
    status === ' M vercel.json\0' &&
    git('diff', '--summary', '--', 'vercel.json').trim() === ''
  ) {
    try {
      const root = git('rev-parse', '--show-toplevel').trim();
      const committed: unknown = JSON.parse(git('show', 'HEAD:vercel.json'));
      const current: unknown = JSON.parse(readFileSync(path.join(root, 'vercel.json'), 'utf8'));
      dirty = !isDeepStrictEqual(committed, current);
    } catch {
      dirty = true;
    }
  }
  return { commit: vercelCommit?.toLowerCase() ?? head, dirty };
}
