import 'fake-indexeddb/auto';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { routes } from '@/app/router';
import { ApiClient, type Transport } from '@/lib/api-client';
import { createDemoTransport } from '@/mocks/auth';
import { retainedId, loadPackage, savePackage, replaceBrowserId } from './storage';
import { packageSchema } from './schemas';
import fixture from '../../../nexora-backend/docs/Nexora_Backend_BE10_v0.11/docs/fixtures/student-exam-v1.json';
import * as store from '@/features/runner/store';
import { monitorFixture } from './monitor/test-fixture';

describe('replacement browser registration', () => {
  it('registers a retained ID without creating or transferring an attempt', async () => {
    const demo = createDemoTransport('student');
    const paths: string[] = [];
    const transport: Transport = (url, init) => {
      paths.push(url);
      return demo(url, init);
    };
    render(
      <App
        router={createMemoryRouter(routes, { initialEntries: ['/student/device'] })}
        client={new ApiClient('/api/v1', transport)}
        queryClient={new QueryClient()}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Register this browser' }));
    await screen.findByRole('heading', { name: 'Browser registered' });
    expect(screen.getByLabelText('Registered browser ID').textContent).toBe(
      await retainedId('browser-device'),
    );
    expect(paths.some((p) => p.includes('/attempts'))).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Verify browser registration' }));
    expect((await screen.findByLabelText('Registered browser ID')).textContent).toBe(
      await retainedId('browser-device'),
    );
  });
  it('requires confirmation to replace a lost credential, retains evidence and reuses the new ID after a lost response', async () => {
    const old = await retainedId('browser-device');
    const packet = packageSchema.parse(fixture.package);
    await savePackage('device-test-evidence', packet);
    const demo = createDemoTransport('student');
    let dropped = false;
    const ids: string[] = [];
    const transport: Transport = async (url, init) => {
      if (url.endsWith('/auth/device')) {
        const data: unknown = JSON.parse(String(init.body));
        const id =
          typeof data === 'object' && data && 'deviceId' in data ? String(data.deviceId) : '';
        ids.push(id);
        if (id === old)
          return Response.json(
            {
              code: 'DEVICE_REPLACED',
              message: 'Credential expired.',
              details: [],
              requestId: 'fixture',
            },
            { status: 409 },
          );
        const result = await demo(url, init);
        if (!dropped) {
          dropped = true;
          throw new TypeError('Lost enrollment response');
        }
        return result;
      }
      return demo(url, init);
    };
    render(
      <App
        router={createMemoryRouter(routes, { initialEntries: ['/student/device'] })}
        client={new ApiClient('/api/v1', transport)}
        queryClient={new QueryClient()}
      />,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Register this browser' }));
    const replace = await screen.findByRole('button', { name: 'Create new browser registration' });
    expect(replace).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(replace);
    await screen.findByText(/This action could not be confirmed/);
    const next = await retainedId('browser-device');
    expect(next).not.toBe(old);
    await user.click(screen.getByRole('button', { name: 'Register this browser' }));
    await screen.findByRole('heading', { name: 'Browser registered' });
    expect(ids).toEqual([old, next, next]);
    expect(await loadPackage('device-test-evidence')).toEqual(packet);
    await expect(replaceBrowserId(old)).rejects.toThrow('changed in another tab');
  });
  it('restores only server-confirmed answers at sequence zero and retains the old generation outbox', async () => {
    const c = await monitorFixture();
    const owner = { schoolId: 'demo-school', userId: 'demo-student' };
    const paper = c.store.sessions.get('sitting')?.paper;
    if (!paper || !c.items[0]) throw new Error('fixture');
    const old = await store.initialize(owner, c.attempt, paper);
    await store.saveAnswer(old.key, c.items[0].itemId, null, Date.parse(c.attempt.startsAt));
    await c.monitor.transfer(c.attempt.attemptId, c.body, crypto.randomUUID());
    await c.login('STUDENT');
    const current = await c.exams.attempt(c.attempt.attemptId);
    const replacement = await store.initialize(owner, current, paper);
    const restored = await store.reconcile(replacement.key, current);
    expect(restored.answers[0]).toMatchObject({ value: c.items[0].correctOptionId, clientSeq: 0 });
    expect(restored.outbox).toHaveLength(0);
    expect(restored.seq).toBe(0);
    expect((await store.readRecord(old.key))?.outbox[0]?.value).toBeNull();
    expect(await store.recordsFor(owner, c.attempt.attemptId)).toHaveLength(2);
  });
});
