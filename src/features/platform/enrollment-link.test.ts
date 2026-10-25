import { describe, expect, it } from 'vitest';
import { administratorEnrollmentLink } from './enrollment-link';

describe('administrator enrollment links', () => {
  it('sends enrollment to the school origin and keeps its token out of the query', () => {
    const link = new URL(administratorEnrollmentLink('private-token', 'https://school.example'));
    expect(link.origin).toBe('https://school.example');
    expect(link.pathname).toBe('/admin-enrollment');
    expect(link.search).toBe('');
    expect(link.hash).toBe('#private-token');
  });
  it('allows local development but rejects unsafe or path-bearing origins', () => {
    expect(administratorEnrollmentLink('token', 'http://127.0.0.1:5183')).toContain(':5183/');
    for (const origin of [
      'http://school.example',
      'https://user:pass@school.example',
      'https://school.example/path',
      'https://school.example?query=1',
    ])
      expect(() => administratorEnrollmentLink('token', origin)).toThrow();
  });
});
