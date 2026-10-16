import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { releaseSource } from './release-source.ts';

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
const { commit, dirty } = releaseSource(process.cwd());
const worker = await readFile(path.join(root, 'sw.js'), 'utf8');
const buildId = /const VERSION = "([^"]+)"/.exec(worker)?.[1];
if (!buildId) throw new Error('Built service worker has no build identity.');
const files = await inventory(root);
const encodedManifest = /const MANIFEST = (.*);/.exec(worker)?.[1];
if (!encodedManifest) throw new Error('Built service worker has no asset manifest.');
const manifest: unknown = JSON.parse(encodedManifest);
if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
  throw new Error('Invalid offline asset manifest.');
for (const file of files.filter(
  (file) => file.file === 'index.html' || file.file.startsWith('assets/'),
)) {
  if (Reflect.get(manifest, `/${file.file}`) !== file.sha256)
    throw new Error(`Offline checksum differs from final build output: ${file.file}`);
}
await writeFile(
  path.join(root, 'release.json'),
  JSON.stringify({ commit, dirty, buildId, files }, null, 2) + '\n',
);
