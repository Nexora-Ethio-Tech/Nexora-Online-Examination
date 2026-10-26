import { describe, expect, it } from 'vitest';
import { actionSchema } from '../../src/platform/platform-schemas';
const base = {
  action: 'provision',
  requestId: '11111111-1111-4111-8111-111111111111',
  reason: 'Create test school',
  code: '123456',
  name: 'School',
  slug: 'test-school',
  loginId: 'ADMIN',
  firstName: 'A',
  fatherName: 'B',
  grandfatherName: 'C',
};
describe('optional owner administrator contacts', () => {
  it('accepts omitted and empty contacts', () => {
    expect(actionSchema.safeParse(base).success).toBe(true);
    expect(actionSchema.safeParse({ ...base, phoneNumber: '', recoveryEmail: '' }).success).toBe(
      true,
    );
  });
  it('validates supplied Ethiopian phone and email formats', () => {
    expect(
      actionSchema.safeParse({
        ...base,
        phoneNumber: '+251911123456',
        recoveryEmail: 'admin@example.com',
      }).success,
    ).toBe(true);
    for (const phoneNumber of ['+254911123456', '+251911', '911123456', '+251abcdefghi'])
      expect(actionSchema.safeParse({ ...base, phoneNumber }).success).toBe(false);
    expect(actionSchema.safeParse({ ...base, recoveryEmail: 'invalid' }).success).toBe(false);
  });
});
