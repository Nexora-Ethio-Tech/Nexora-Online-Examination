import { it, expect } from 'vitest';
import { toDataURL } from 'qrcode';
import { validatePng } from '../../src/modules/authoring/image-validation';
it('accepts a complete raster PNG and rejects damaged pixel payloads', async () => {
  const data = await toDataURL('synthetic image', { width: 100 });
  expect(() => validatePng(data)).not.toThrow();
  const bytes = Buffer.from(data.split(',')[1], 'base64');
  bytes[50] ^= 1;
  expect(() => validatePng('data:image/png;base64,' + bytes.toString('base64'))).toThrow();
  expect(() => validatePng('data:image/svg+xml;base64,PHN2Zz4=')).toThrow();
});
