import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ClockService } from '../../src/common/clock/clock.service';
import {
  encryptExamPackage,
  decryptExamPackage,
} from '../../src/common/crypto/package-cipher';
import {
  canonicalJsonStringify,
  computeCanonicalDigest,
  computeFinalSnapshotDigest,
} from '../../src/common/crypto/canonical-digest';
import {
  hashPassword,
  verifyPassword,
  generateCsprngPassword,
  formatLoginId,
  hashSha256,
} from '../../src/common/crypto/password';

describe('Phase 1 Core Foundations', () => {
  it('ClockService should return current UTC and allow deterministic manipulation', () => {
    const clock = new ClockService();
    const now = clock.now();
    expect(now).toBeInstanceOf(Date);

    clock.setMockTime('2026-10-17T06:00:00Z');
    expect(clock.isoString()).toBe('2026-10-17T06:00:00.000Z');

    clock.advanceByMs(10 * 60 * 1000); // 10 minutes
    expect(clock.isoString()).toBe('2026-10-17T06:10:00.000Z');

    clock.reset();
    expect(clock.now().getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('Package Cipher should encrypt with AES-256-GCM and decrypt correctly', () => {
    const payload = {
      examVersion: 1,
      title: 'Mathematics Test',
      items: [{ itemId: 'q1', stem: 'Solve 2x = 4', marks: 2 }],
    };

    const enc = encryptExamPackage(payload);
    expect(enc.algorithm).toBe('AES-GCM');
    expect(enc.iv).toBeDefined();
    expect(enc.ciphertext).toBeDefined();
    expect(enc.sha256).toBeDefined();
    expect(enc.keyBase64url).toBeDefined();

    const decrypted = decryptExamPackage<typeof payload>(
      enc.ciphertext,
      enc.iv,
      enc.keyBase64url,
    );

    expect(decrypted).toEqual(payload);
  });

  it('Canonical digest should sort keys recursively and match hex SHA-256', () => {
    const objA = { b: 2, a: 1, nested: { z: 10, y: 5 } };
    const objB = { a: 1, nested: { y: 5, z: 10 }, b: 2 };

    expect(canonicalJsonStringify(objA)).toBe('{"a":1,"b":2,"nested":{"y":5,"z":10}}');
    expect(computeCanonicalDigest(objA)).toBe(computeCanonicalDigest(objB));
  });

  it('Matches official student-exam-v1.json fixture for canonicalUtf8 and snapshotDigest byte-for-byte', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/student-exam-v1.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    const { canonicalUtf8, snapshotDigest } = computeFinalSnapshotDigest({
      attemptId: fixture.attemptId,
      examVersion: fixture.finalRequest.examVersion,
      scheduleRevision: fixture.finalRequest.scheduleRevision,
      deviceGeneration: fixture.finalRequest.deviceGeneration,
      finalSeq: fixture.finalRequest.finalSeq,
      answers: fixture.finalRequest.answers,
    });

    expect(canonicalUtf8).toBe(fixture.canonicalUtf8);
    expect(snapshotDigest).toBe(fixture.snapshotDigest);
  });

  it('Decodes official student-exam-v1.json encrypted package with unlockKey', () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/student-exam-v1.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

    const decrypted = decryptExamPackage(
      fixture.package.ciphertext,
      fixture.package.iv,
      fixture.unlockKey,
    );

    expect(decrypted).toEqual(fixture.plaintext);
  });

  it('Argon2id password hashing and verification should succeed', async () => {
    const plain = 'StrongPass123!';
    const hash = await hashPassword(plain);

    expect(hash).toContain('$argon2id$');
    const isValid = await verifyPassword(hash, plain);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword(hash, 'WrongPassword');
    expect(isInvalid).toBe(false);
  });

  it('formatLoginId and generateCsprngPassword formatting', () => {
    expect(formatLoginId('sch', 1)).toBe('SCH-001');
    expect(formatLoginId('SCH', 42)).toBe('SCH-042');

    const pass = generateCsprngPassword(12);
    expect(pass.length).toBe(12);
  });
});
