import { inflateSync } from 'zlib';
import type { ContentBlock, Structure } from './content-schema';
function checksum(bytes: Buffer) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
export function validatePng(data: string) {
  const encoded = data.slice('data:image/png;base64,'.length),
    bytes = Buffer.from(encoded, 'base64');
  if (
    !data.startsWith('data:image/png;base64,') ||
    bytes.toString('base64') !== encoded ||
    bytes.length > 210000 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  )
    throw new Error('Invalid PNG image');
  let offset = 8,
    width = 0,
    height = 0,
    channels = 0,
    ended = false;
  const compressed: Buffer[] = [];
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset),
      type = bytes.toString('ascii', offset + 4, offset + 8),
      end = offset + 8 + length;
    if (
      end + 4 > bytes.length ||
      checksum(bytes.subarray(offset + 4, end)) !== bytes.readUInt32BE(end)
    )
      throw new Error('Damaged PNG image');
    const chunk = bytes.subarray(offset + 8, end);
    if (offset === 8 && type !== 'IHDR') throw new Error('Missing PNG dimensions');
    if (type === 'IHDR') {
      if (width || length !== 13) throw new Error('Invalid PNG header');
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (
        !width ||
        !height ||
        width > 1200 ||
        height > 1200 ||
        chunk[8] !== 8 ||
        !channels ||
        chunk[10] ||
        chunk[11] ||
        chunk[12]
      )
        throw new Error('Use a resized RGB or RGBA PNG image');
    } else if (type === 'IDAT') compressed.push(chunk);
    else if (type === 'IEND') {
      if (length || end + 4 !== bytes.length) throw new Error('Invalid PNG ending');
      ended = true;
      break;
    } else if (type === 'acTL' || /^[A-Z]/.test(type)) throw new Error('Unsupported PNG image');
    offset = end + 4;
  }
  if (!ended || !compressed.length) throw new Error('Incomplete PNG image');
  const stride = width * channels + 1,
    decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: stride * height });
  if (decoded.length !== stride * height) throw new Error('Invalid PNG pixel data');
  for (let row = 0; row < height; row++)
    if (decoded[row * stride] > 4) throw new Error('Invalid PNG filter');
}
export function validateImages(structure: Structure, items: { content?: ContentBlock[] }[]) {
  const blocks = [
    ...structure.sections.flatMap((s) => s.blocks),
    ...structure.passages.flatMap((p) => p.blocks),
    ...items.flatMap((i) => i.content ?? []),
  ];
  for (const block of blocks) if (block.kind === 'image') validatePng(block.data);
}
