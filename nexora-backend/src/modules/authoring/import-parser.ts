import { fromBuffer, Entry } from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { randomUUID } from 'crypto';
import { Item, itemSchema } from './schemas';

export type ImportDiagnostic = { row: number; field: string; message: string };
export class ImportFormatError extends Error {
  constructor(public readonly diagnostics: ImportDiagnostic[]) {
    super('Question import failed validation');
  }
}
function fail(message: string): never {
  throw new ImportFormatError([{ row: 1, field: 'file', message }]);
}
const HEADERS = [
  'external_id',
  'type',
  'question',
  'option_a',
  'option_b',
  'option_c',
  'option_d',
  'answer',
  'marks',
];

async function unzip(source: Buffer) {
  if (source.length > 5 * 1024 * 1024) fail('File exceeds 5 MiB');
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    fromBuffer(
      source,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) {
          reject(
            new ImportFormatError([
              { row: 1, field: 'file', message: 'Invalid OOXML ZIP archive' },
            ]),
          );
          return;
        }
        const files = new Map<string, Buffer>();
        let total = 0,
          count = 0,
          done = false;
        const stop = (message: string) => {
          if (done) return;
          done = true;
          zip.close();
          reject(new ImportFormatError([{ row: 1, field: 'file', message }]));
        };
        zip.on('error', () => stop('Invalid ZIP entry'));
        zip.on('end', () => {
          if (!done) {
            done = true;
            resolve(files);
          }
        });
        zip.on('entry', (entry: Entry) => {
          if (
            ++count > 1000 ||
            entry.generalPurposeBitFlag & 1 ||
            entry.fileName.split('/').includes('..') ||
            entry.fileName.startsWith('/') ||
            files.has(entry.fileName)
          ) {
            stop('Unsafe or excessive ZIP entries');
            return;
          }
          total += entry.uncompressedSize;
          if (total > 25 * 1024 * 1024) {
            stop('Expanded file exceeds 25 MiB');
            return;
          }
          if (entry.fileName.endsWith('/')) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              stop('Unreadable ZIP entry');
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            stream.on('error', () => stop('Invalid compressed entry'));
            stream.on('data', (data: Buffer) => {
              size += data.length;
              if (size > entry.uncompressedSize || size > 25 * 1024 * 1024) {
                stream.destroy();
                stop('Expanded file exceeds declared size');
                return;
              }
              chunks.push(data);
            });
            stream.on('end', () => {
              if (done) return;
              files.set(entry.fileName, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}

type Node = { name: string; attrs: Record<string, string>; children: Node[]; text: string };
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function convert(value: unknown, depth = 0): Node[] {
  if (depth > 80) fail('XML nesting exceeds supported depth');
  if (!Array.isArray(value)) fail('Invalid XML structure');
  const nodes: Node[] = [];
  for (const part of value) {
    if (!record(part)) fail('Invalid XML node');
    const attrs: Record<string, string> = {};
    if (record(part[':@']))
      for (const [k, v] of Object.entries(part[':@'])) {
        if (typeof v !== 'string') fail('Invalid XML attribute');
        attrs[k.replace(/^@_/, '')] = v;
      }
    for (const [key, children] of Object.entries(part)) {
      if (key === ':@' || key.startsWith('?')) continue;
      if (key === '#text') {
        if (typeof children !== 'string') fail('Invalid text');
        nodes.push({ name: '#text', attrs: {}, children: [], text: children });
      } else
        nodes.push({
          name: key.split(':').at(-1) ?? key,
          attrs,
          children: convert(children, depth + 1),
          text: '',
        });
    }
  }
  return nodes;
}
function xml(bytes: Buffer): Node[] {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('XML must use UTF-8');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) fail('XML declarations and entities are unsupported');
  if (XMLValidator.validate(source) !== true) fail('Malformed XML');
  const value: unknown = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
  }).parse(source);
  return convert(value);
}
function all(nodes: Node[], name: string): Node[] {
  return nodes.flatMap((n) => [...(n.name === name ? [n] : []), ...all(n.children, name)]);
}
function text(nodes: Node[]): string {
  return nodes
    .map((n) =>
      n.name === '#text'
        ? n.text
        : n.name === 'tab'
          ? '\t'
          : n.name === 'br'
            ? '\n'
            : text(n.children),
    )
    .join('');
}
function attr(n: Node, name: string) {
  return (
    n.attrs[name] ?? Object.entries(n.attrs).find(([key]) => key.split(':').at(-1) === name)?.[1]
  );
}

export async function parseQuestionFile(source: Buffer): Promise<Item[]> {
  const files = await unzip(source);
  const parsed = new Map<string, Node[]>();
  for (const [name, bytes] of files) {
    if (name === 'docProps/thumbnail.jpeg' || name === 'docProps/thumbnail.wmf') continue;
    if (!name.endsWith('.xml') && !name.endsWith('.rels'))
      fail('Macros, images and embedded objects are unsupported');
    if (/(?:^|\/)(?:media|embeddings|externalLinks|activeX)\//i.test(name))
      fail('Embedded content is unsupported');
    const nodes = xml(bytes);
    parsed.set(name, nodes);
    if (
      all(nodes, 'Override').some((n) =>
        /macroEnabled|vbaProject/i.test(attr(n, 'ContentType') ?? ''),
      )
    )
      fail('Macro-enabled documents are unsupported');
    if (
      name.endsWith('.rels') &&
      all(nodes, 'Relationship').some((n) => attr(n, 'TargetMode')?.toLowerCase() === 'external')
    )
      fail('External relationships are unsupported');
  }
  const doc = parsed.get('word/document.xml'),
    book = parsed.get('xl/workbook.xml');
  if (Boolean(doc) === Boolean(book)) fail('Upload a DOCX or XLSX question template');
  let rows: string[][] = [];
  if (doc) {
    for (const forbidden of [
      'drawing',
      'pict',
      'object',
      'gridSpan',
      'vMerge',
      'altChunk',
      'fldSimple',
      'instrText',
    ])
      if (all(doc, forbidden).length) fail('Images, fields and merged cells are unsupported');
    const tables = all(doc, 'tbl');
    if (tables.length !== 1) fail('DOCX must contain exactly one simple table');
    rows = tables[0].children
      .filter((n) => n.name === 'tr')
      .map((row) =>
        row.children
          .filter((n) => n.name === 'tc')
          .map((cell) =>
            cell.children
              .filter((n) => n.name === 'p')
              .map((p) => text(p.children))
              .join('\n'),
          ),
      );
  } else if (book) {
    if ([...parsed.keys()].filter((name) => /^xl\/worksheets\/[^/]+\.xml$/.test(name)).length !== 1)
      fail('XLSX must contain exactly one worksheet part');
    const sheets = all(book, 'sheet');
    if (sheets.length !== 1 || attr(sheets[0], 'name') !== 'Questions')
      fail('XLSX must contain one Questions worksheet');
    const relationship = all(parsed.get('xl/_rels/workbook.xml.rels') ?? [], 'Relationship').find(
      (n) => attr(n, 'Id') === attr(sheets[0], 'id'),
    );
    const target = relationship ? attr(relationship, 'Target') : undefined;
    if (!target || target.includes('..')) fail('Invalid worksheet relationship');
    const sheet = parsed.get(target.startsWith('/') ? target.slice(1) : `xl/${target}`);
    if (!sheet) fail('Missing Questions worksheet');
    for (const forbidden of ['f', 'mergeCell', 'drawing', 'oleObject'])
      if (all(sheet, forbidden).length)
        fail('Formulas, merged cells and embedded objects are unsupported');
    const shared = all(parsed.get('xl/sharedStrings.xml') ?? [], 'si').map((n) =>
      all([n], 't')
        .map((t) => text(t.children))
        .join(''),
    );
    const cells = new Map<string, string>();
    let maxRow = 0;
    for (const cell of all(sheet, 'c')) {
      const ref = attr(cell, 'r'),
        match = ref?.match(/^([A-Z]+)([1-9]\d*)$/);
      if (!match) fail('Invalid cell reference');
      const kind = attr(cell, 't'),
        raw = all([cell], 'v')
          .map((n) => text(n.children))
          .join('');
      let value = raw;
      if (kind === 's') {
        if (!/^\d+$/.test(raw) || shared[Number(raw)] === undefined) fail('Invalid shared string');
        value = shared[Number(raw)];
      } else if (kind === 'inlineStr')
        value = all([cell], 't')
          .map((n) => text(n.children))
          .join('');
      else if (kind && kind !== 'n' && kind !== 'str') fail('Unsupported cell type');
      if (!value.trim()) continue;
      const row = Number(match[2]);
      if (match[1].length !== 1 || match[1] > 'I' || row > 201)
        fail('Unexpected content outside the question table');
      const cellRef = match[0];
      if (cells.has(cellRef)) fail('Duplicate spreadsheet cell');
      cells.set(cellRef, value);
      maxRow = Math.max(maxRow, row);
    }
    rows = Array.from({ length: maxRow }, (_, r) =>
      HEADERS.map((_, c) => cells.get(`${String.fromCharCode(65 + c)}${r + 1}`) ?? ''),
    );
  }
  if (rows[0]?.length !== HEADERS.length || rows[0].some((v, i) => v.trim() !== HEADERS[i]))
    fail('Column headers must match the downloadable template');
  if (rows.length < 2 || rows.length > 201) fail('Use between 1 and 200 questions');
  const diagnostics: ImportDiagnostic[] = [],
    items: Item[] = [],
    ids = new Set<string>();
  rows.slice(1).forEach((cells, index) => {
    const row = index + 2,
      values = cells.map((v) => v.trim());
    const [externalId, type, stem, a, b, c, d, answer, marks] = values;
    const error = (field: string, message: string) => diagnostics.push({ row, field, message });
    if (values.length !== 9) {
      error('row', 'Expected nine cells');
      return;
    }
    if (ids.has(externalId)) error('external_id', 'External IDs must be unique');
    ids.add(externalId);
    let options: { id: string; text: string }[] = [],
      correctOptionId = answer;
    if (type === 'true_false') {
      options = [
        { id: 'true', text: 'True' },
        { id: 'false', text: 'False' },
      ];
      if ([a, b, c, d].some(Boolean)) error('options', 'True/false option cells must be blank');
      if (!['TRUE', 'FALSE'].includes(answer)) error('answer', 'Use TRUE or FALSE');
      correctOptionId = answer.toLowerCase();
    } else if (type === 'mcq_single') {
      const choices = [a, b, c, d];
      options = choices.flatMap((v, i) =>
        v ? [{ id: String.fromCharCode(65 + i), text: v }] : [],
      );
      if (!a || !b || (!c && d)) error('options', 'Use at least A and B with no gaps');
    } else error('type', 'Use mcq_single or true_false');
    if (!/^[1-9]\d*$/.test(marks)) error('marks', 'Marks must be a positive integer');
    const item = {
      itemId: randomUUID(),
      externalId,
      type,
      stem,
      options,
      correctOptionId,
      marks: Number(marks),
      primaryTopic: '',
      secondaryTopics: [],
      explanation: '',
      keyConsistent: null,
      reviewFlags: [],
      reviewed: false,
      reviewNote: '',
    };
    const valid = itemSchema.safeParse(item);
    if (!valid.success)
      for (const issue of valid.error.issues) error(issue.path.join('.') || 'row', issue.message);
    else items.push(valid.data);
  });
  if (diagnostics.length) throw new ImportFormatError(diagnostics);
  return items;
}
