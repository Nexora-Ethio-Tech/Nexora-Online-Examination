import { openDB, type DBSchema } from 'idb';
import type { EncryptedPackage } from './schemas';
interface PreparationDB extends DBSchema {
  identities: { key: string; value: string };
  packages: { key: string; value: EncryptedPackage };
}
const database = () =>
  openDB<PreparationDB>('nexora-preparation-v1', 1, {
    upgrade(db) {
      db.createObjectStore('identities');
      db.createObjectStore('packages');
    },
  });
// JSON tuples avoid delimiter collisions; never delete evidence on logout.
export const storageKey = (...parts: (string | number)[]) => JSON.stringify(parts);
export async function loadPackage(key: string) {
  const db = await database();
  try {
    return await db.get('packages', key);
  } finally {
    db.close();
  }
}
export async function retainedId(key: string) {
  const db = await database();
  try {
    const tx = db.transaction('identities', 'readwrite');
    void tx.done.catch(() => undefined);
    let value = await tx.store.get(key);
    if (!value) {
      value = crypto.randomUUID();
      await tx.store.put(value, key);
    }
    await tx.done;
    return value;
  } finally {
    db.close();
  }
}
export async function savePackage(key: string, value: EncryptedPackage) {
  const db = await database();
  try {
    const tx = db.transaction('packages', 'readwrite');
    void tx.done.catch(() => undefined);
    await tx.store.put(value, key);
    await tx.done;
    const stored = await db.get('packages', key);
    if (stored?.sha256 !== value.sha256 || stored.ciphertext !== value.ciphertext)
      throw new Error('Storage verification failed.');
  } finally {
    db.close();
  }
}
