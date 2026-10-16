import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
async function inventory(directory: string): Promise<{ file: string; sha256: string }[]> {
  const result: { file: string; sha256: string }[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await inventory(full)));
    else if (entry.name !== 'release.json')
      result.push({
        file: path.relative(root, full).split(path.sep).join('/'),
        sha256: createHash('sha256')
          .update(await readFile(full))
          .digest('hex'),
      });
  }
  return result.sort((a, b) => a.file.localeCompare(b.file));
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const dirty =
  execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0;
const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
const buildId = /const VERSION = "([^"]+)"/.exec(worker)?.[1];
if (!buildId) throw new Error('Built service worker has no build identity.');
await writeFile(
  path.join(root, 'release.json'),
  JSON.stringify({ commit, dirty, buildId, files: await inventory(root) }, null, 2) + '\n',
);
