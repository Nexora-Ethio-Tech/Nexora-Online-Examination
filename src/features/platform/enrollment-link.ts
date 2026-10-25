export function administratorEnrollmentLink(token: string, schoolOrigin: string) {
  const url = new URL(schoolOrigin);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))
  )
    throw new Error('Configure the school portal HTTPS origin for administrator enrollment.');
  return `${url.origin}/admin-enrollment#${encodeURIComponent(token)}`;
}
