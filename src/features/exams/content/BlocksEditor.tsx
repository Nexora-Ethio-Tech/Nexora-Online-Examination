import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ContentBlock } from './schema';
const field = 'w-full min-h-11 rounded border p-2 bg-background';
export function BlocksEditor({
  value,
  onChange,
}: {
  value: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
}) {
  const [error, setError] = useState('');
  const update = (i: number, b: ContentBlock) => onChange(value.map((v, j) => (j === i ? b : v)));
  async function upload(file: File | undefined) {
    if (!file) return;
    setError('');
    if (
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError('Choose a PNG, JPEG or WebP image up to 5 MB.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error();
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const data = canvas.toDataURL('image/png');
      if (data.length > 280000) {
        setError(
          'This image is too large after conversion. Resize it and try again (about 200 KB).',
        );
        return;
      }
      onChange([...value, { id: crypto.randomUUID(), kind: 'image', data, alt: '', caption: '' }]);
    } catch {
      setError('The image could not be read. Choose another image.');
    }
  }
  return (
    <div className="space-y-3">
      {value.map((b, i) => (
        <div key={b.id} className="rounded border p-3 space-y-2">
          <p className="font-medium">
            {b.kind === 'text' ? 'Text' : b.kind === 'image' ? 'Image' : 'Table'} {i + 1}
          </p>
          {b.kind === 'text' && (
            <label>
              Text
              <textarea
                className={field}
                rows={4}
                value={b.text}
                onChange={(e) => update(i, { ...b, text: e.target.value })}
              />
            </label>
          )}
          {b.kind === 'image' && (
            <>
              <img src={b.data} alt={b.alt || 'Image preview'} className="max-h-48 max-w-full" />
              <label>
                Image description (required)
                <input
                  className={field}
                  value={b.alt}
                  onChange={(e) => update(i, { ...b, alt: e.target.value })}
                />
              </label>
              <label>
                Caption
                <input
                  className={field}
                  value={b.caption}
                  onChange={(e) => update(i, { ...b, caption: e.target.value })}
                />
              </label>
            </>
          )}
          {b.kind === 'table' && (
            <>
              <div className="overflow-x-auto">
                <table>
                  <thead>
                    <tr>
                      {b.headers.map((h, c) => (
                        <th key={c}>
                          <input
                            aria-label={'Column ' + (c + 1) + ' heading'}
                            className={field}
                            value={h}
                            onChange={(e) =>
                              update(i, {
                                ...b,
                                headers: b.headers.map((v, j) => (j === c ? e.target.value : v)),
                              })
                            }
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) => (
                          <td key={c}>
                            <input
                              aria-label={'Row ' + (r + 1) + ' column ' + (c + 1)}
                              className={field}
                              value={cell}
                              onChange={(e) =>
                                update(i, {
                                  ...b,
                                  rows: b.rows.map((v, j) =>
                                    j === r ? v.map((x, k) => (k === c ? e.target.value : x)) : v,
                                  ),
                                })
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={b.rows.length >= 30}
                onClick={() => update(i, { ...b, rows: [...b.rows, b.headers.map(() => '')] })}
              >
                Add row
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={b.headers.length >= 10}
                onClick={() =>
                  update(i, {
                    ...b,
                    headers: [...b.headers, ''],
                    rows: b.rows.map((r) => [...r, '']),
                  })
                }
              >
                Add column
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!b.rows.length}
                onClick={() => update(i, { ...b, rows: b.rows.slice(0, -1) })}
              >
                Remove last row
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={b.headers.length <= 1}
                onClick={() =>
                  update(i, {
                    ...b,
                    headers: b.headers.slice(0, -1),
                    rows: b.rows.map((r) => r.slice(0, -1)),
                  })
                }
              >
                Remove last column
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={i === 0}
            onClick={() => {
              const next = [...value];
              const previous = next[i - 1];
              if (!previous) return;
              next[i - 1] = b;
              next[i] = previous;
              onChange(next);
            }}
          >
            Move up
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            Remove block
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={value.length >= 20}
          onClick={() => onChange([...value, { id: crypto.randomUUID(), kind: 'text', text: '' }])}
        >
          Add text
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={value.length >= 20}
          onClick={() =>
            onChange([
              ...value,
              {
                id: crypto.randomUUID(),
                kind: 'table',
                headers: ['Column 1', 'Column 2'],
                rows: [['', '']],
              },
            ])
          }
        >
          Add table
        </Button>
        <label className="rounded border p-2">
          Add image
          <input
            className="block w-full min-w-0 max-w-full text-sm"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            disabled={value.length >= 20}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
