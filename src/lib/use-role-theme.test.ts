import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useRoleTheme } from '@/lib/use-role-theme';

describe('useRoleTheme', () => {
  it('sets data-role on the html element and removes it on unmount', () => {
    const { unmount } = renderHook(() => useRoleTheme('student'));
    expect(document.documentElement.dataset.role).toBe('student');
    unmount();
    expect(document.documentElement.dataset.role).toBeUndefined();
  });
});
