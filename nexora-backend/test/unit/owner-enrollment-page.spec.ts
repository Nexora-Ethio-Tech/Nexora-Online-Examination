import { describe, expect, it } from 'vitest';
import { enrollmentHtml } from '../../scripts/owner-enrollment-page';
describe('private owner enrollment page', () => {
  it('renders the current secret with an inline QR and escapes account labels', async () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    const html = await enrollmentHtml('<script>alert(1)</script>', secret);
    expect(html).toContain(`code>${secret}</code>`);
    expect(html).toContain('data:image/png;base64,');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('src="https:');
  });
});
