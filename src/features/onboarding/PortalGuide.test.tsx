import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import { PortalGuide } from './PortalGuide';
import { guideRevision } from './guide';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
const guide = (userId = 'new-user') => (
  <MemoryRouter>
    <PortalGuide role="teacher" schoolId="school" userId={userId} />
  </MemoryRouter>
);
it('offers guidance to a new user, remembers dismissal and permits reopening', () => {
  const view = render(guide());
  expect(screen.getByRole('complementary', { name: 'Portal onboarding' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Next tip' }));
  expect(screen.getByText('Upload and manage questions')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
  view.unmount();
  render(guide());
  expect(
    screen.queryByRole('complementary', { name: 'Portal onboarding' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Portal guide' }));
  expect(screen.getByText('Create a paper')).toBeVisible();
});
it('reoffers changed content and isolates the preference by account', () => {
  localStorage.setItem('nexora:guide:school:new-user:teacher', 'old feature text');
  const view = render(guide());
  expect(screen.getByText('Create a paper')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
  expect(localStorage.getItem('nexora:guide:school:new-user:teacher')).toBe(
    guideRevision('teacher'),
  );
  view.unmount();
  render(guide('another-user'));
  expect(screen.getByText('Create a paper')).toBeVisible();
});
it('works when browser preference storage is blocked', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  render(guide());
  fireEvent.click(screen.getByRole('button', { name: 'Close guide' }));
  expect(
    screen.queryByRole('complementary', { name: 'Portal onboarding' }),
  ).not.toBeInTheDocument();
});
