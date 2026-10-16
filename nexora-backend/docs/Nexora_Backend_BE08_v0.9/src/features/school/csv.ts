// Used only when a staff member explicitly downloads their one-time credential list.
export function safeCsvCell(value: string) {
  const first = [...value].find((c) => c.charCodeAt(0) > 31 && !/\s/.test(c));
  const safe = (first && '=+@-'.includes(first)) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function credentialsCsv(rows: { displayName: string; loginId: string; password: string }[]) {
  return (
    '\ufeff' +
    [
      ['displayName', 'loginId', 'password'],
      ...rows.map((r) => [r.displayName, r.loginId, r.password]),
    ]
      .map((r) => r.map(safeCsvCell).join(','))
      .join('\r\n')
  );
}
