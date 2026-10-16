export function readEnvironment(values: {
  baseUrl?: string;
  useMocks?: string;
  production: boolean;
}) {
  const baseUrl = (values.baseUrl || '/api/v1').replace(/\/$/, '');
  if (!(baseUrl.startsWith('/') && !baseUrl.startsWith('//')) && !/^https?:\/\//.test(baseUrl)) {
    throw new Error('VITE_API_BASE_URL must be an HTTP(S) URL or an absolute path.');
  }
  if (values.production && baseUrl.startsWith('http:'))
    throw new Error('Production API must use HTTPS.');
  if (values.useMocks && !['true', 'false'].includes(values.useMocks))
    throw new Error('VITE_USE_MOCKS must be true or false.');
  if (values.production && values.useMocks === 'true')
    throw new Error('Mocks are not allowed in production.');
  return { baseUrl, useMocks: !values.production && values.useMocks === 'true' };
}
