// Small strict fixture-side parser. Production parses and validates on the server.
export function parseRosterCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  let closed = false;
  const source = text.replace(/^\ufeff/, '');
  const cell = () => {
    row.push(value);
    value = '';
    closed = false;
  };
  const record = () => {
    cell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
    } else if (c === ',') cell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      record();
    } else if (c === '"' && !value && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error('Invalid CSV quoting.');
      value += c;
    }
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.');
  if (value || row.length || closed) record();
  while (rows.length && rows.at(-1)?.every((v) => !v.trim())) rows.pop();
  return rows;
}
