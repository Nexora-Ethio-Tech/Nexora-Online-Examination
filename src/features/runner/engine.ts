import { supervisionApi, type Interruption } from './supervision';
import { assistanceApi } from '@/features/assistance/api';
import { ApiClient, ApiError, errorMessage } from '@/lib/api-client';
import { ensureOfflineShell } from '@/lib/offline-shell';
import { examApi } from '@/features/exams/api';
import { loadPackage, retainedId, savePackage, storageKey } from '@/features/exams/storage';
import { packageSchema } from '@/features/exams/schemas';
import { runnerApi } from './api';
import { decryptPaper, snapshotDigest } from './crypto';
import { ExamClock } from './clock';
import { acquireWriter } from './lock';
import { initialView, runnerReducer, type RunnerView } from './reducer';
import * as store from './store';
const message = (error: unknown) =>
  error instanceof ApiError
    ? errorMessage(error)
    : error instanceof Error
      ? error.message
      : 'An unexpected error occurred. Your saved work is retained.';
export class RunnerEngine {
  private view = initialView;
  private listeners = new Set<() => void>();
  private controller = new AbortController();
  private release?: () => void;
  private clock?: ExamClock;
  private queue: Promise<unknown> = Promise.resolve();
  private syncTimer?: ReturnType<typeof setTimeout>;
  private tickTimer?: ReturnType<typeof setInterval>;
  private finishing = false;
  private submitting = false;
  private failures = 0;
  private supervisionTimer?: ReturnType<typeof setInterval>;
  private checkingSupervision = false;
  private api;
  constructor(
    private client: ApiClient,
    private owner: store.Owner,
    private attemptId: string,
    private dependencies = { acquireWriter, ensureOfflineShell },
  ) {
    this.api = runnerApi(client, this.controller.signal);
  }
  snapshot = () => this.view;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private set(value: Partial<RunnerView>) {
    if (this.controller.signal.aborted) return;
    this.view = runnerReducer(this.view, { type: 'patch', value });
    this.listeners.forEach((fn) => fn());
  }
  private alive() {
    this.controller.signal.throwIfAborted();
  }
  async start() {
    try {
      this.release = await this.dependencies.acquireWriter(this.attemptId, this.controller.signal);
      this.alive();
      const locals = await store.recordsFor(this.owner, this.attemptId);
      this.set({ row: locals.find((row) => row.final && !row.receipt) ?? locals.at(-1) ?? null });
      const exams = examApi(this.client);
      const attempt = await exams.attempt(this.attemptId, this.controller.signal);
      this.alive();
      if (attempt.attemptId !== this.attemptId) throw new Error('Attempt identity mismatch.');
      this.clock = new ExamClock(attempt.serverNow);
      this.tickTimer = setInterval(() => this.tick(), 250);

      const currentKey = store.recordKey(this.owner, attempt);
      const disputed = locals.find(
        (row) => row.key !== currentKey && !row.receipt && (row.outbox.length || row.final),
      );
      if (disputed) {
        const row = await store.freeze(disputed.key);
        this.set({
          row,
          status: 'pending',
          message:
            'Your device generation changed. Original work is retained. Ask your school to review it after the submission window.',
        });
        this.schedule();
        return;
      }
      const local = locals.find((row) => row.key === currentKey);
      if (local) this.set({ row: local });
      if (local?.final) {
        this.set({ status: 'pending' });
        await this.retrySubmission();
        this.schedule();
        return;
      }
      if (!['active', 'preparing', 'awaiting_upload'].includes(attempt.state))
        throw new Error(
          `The server reports ${attempt.state.replaceAll('_', ' ')}. Saved evidence is retained; contact your school if this is unexpected.`,
        );
      if (this.clock.now() >= Date.parse(attempt.deadlineAt)) {
        if (local) {
          this.set({ row: local });
          await this.finish();
          this.schedule();
          return;
        }
        throw new Error('This exam window has ended. No editable local attempt is available.');
      }
      const control = await supervisionApi(this.client, this.controller.signal).read(
        this.attemptId,
      );
      if (control.attemptId !== this.attemptId) throw new Error('Supervision identity mismatch.');
      if (control.assistancePaused)
        throw new Error(
          'Workstation assistance is awaiting staff approval. Your saved work and deadline are unchanged.',
        );
      if (control.suspended)
        throw new Error(
          'Your administrator suspended this attempt. Ask for approval before reopening. The deadline is unchanged.',
        );
      if (attempt.state === 'awaiting_upload')
        throw new Error('This attempt is awaiting upload. Contact your school before continuing.');
      if (this.clock.now() < Date.parse(attempt.startsAt))
        throw new Error(
          'The common start has not arrived. Return to preparation and wait for the countdown.',
        );
      const device = await retainedId('browser-device');
      await exams.enroll(device, this.controller.signal);
      const binding = await exams.create(
        attempt.sessionId,
        device,
        await retainedId(
          storageKey(this.owner.schoolId, this.owner.userId, attempt.sessionId, 'create-attempt'),
        ),
        this.controller.signal,
      );
      if (
        binding.attemptId !== attempt.attemptId ||
        binding.deviceGeneration !== attempt.deviceGeneration
      )
        throw new Error('Device binding changed. Reopen to reconcile before editing.');
      const packageKey = storageKey(
        this.owner.schoolId,
        this.owner.userId,
        attempt.sessionId,
        attempt.attemptId,
        attempt.examVersion,
        attempt.scheduleRevision,
        attempt.deviceGeneration,
      );
      const cached = await loadPackage(packageKey);
      const packet = cached
        ? packageSchema.parse(cached)
        : await exams.package(attempt.attemptId, this.controller.signal);
      await this.dependencies.ensureOfflineShell();
      const unlock = await this.api.unlock(attempt, packet);
      this.clock.sync(unlock.serverNow);
      const paper = await decryptPaper(packet, unlock, attempt);
      this.alive();
      if (!cached) await savePackage(packageKey, packet);
      const initial = await store.initialize(this.owner, attempt, paper);
      const row = await store.reconcile(initial.key, attempt);
      this.set({
        row,
        paper,
        status: 'active',
        message: 'Answers are saved on this device before upload.',
      });
      this.tick();

      window.addEventListener('online', this.online);
      document.addEventListener('visibilitychange', this.visible);
      window.addEventListener('blur', this.blurred);
      window.addEventListener('pagehide', this.pagehide);
      document.addEventListener('fullscreenchange', this.fullscreenChanged);
      this.supervisionTimer = setInterval(() => {
        void this.checkSupervision();
      }, 15_000);
      this.schedule();
    } catch (error) {
      if (
        error instanceof ApiError &&
        ['DEVICE_REPLACED', 'RECOVERY_REQUIRED'].includes(error.code) &&
        this.view.row
      ) {
        try {
          this.set({
            row: await store.freeze(this.view.row.key),
            status: 'pending',
            message: `${message(error)} Original work is frozen and retained for receipt verification or school review.`,
          });
          this.schedule();
          return;
        } catch (storageError) {
          this.set({
            status: 'blocked',
            message: `Local finalization failed: ${message(storageError)} Keep this page open.`,
          });
          return;
        }
      }
      this.set({
        status: 'blocked',
        message: `${message(error)} Reconnect and reopen to revalidate. Local work is retained.`,
      });
    }
  }
  private online = () => {
    void this.checkSupervision();
    void this.sync();
  };
  private blurred = () => this.interruption('focus_lost');
  private pagehide = () => this.interruption('pagehide');
  private fullscreenChanged = () => {
    if (!document.fullscreenElement) this.interruption('fullscreen_exit');
  };
  private interruption(kind: Interruption['kind']) {
    if (this.view.status !== 'active' || !this.view.row) return;
    const row = this.view.row;
    const observedAt = new Date().toISOString();
    this.queue = this.queue
      .then(async () => {
        await store.recordInterruption(row.key, {
          id: crypto.randomUUID(),
          kind,
          observedAt,
          deviceGeneration: row.attempt.deviceGeneration,
        });
      })
      .catch(() =>
        this.set({ message: 'Could not save an interruption record. Answers are retained.' }),
      );
  }
  async checkSupervision() {
    if (this.view.status !== 'active' || this.checkingSupervision) return;
    this.checkingSupervision = true;
    let authorizedRead = false;
    try {
      const api = supervisionApi(this.client, this.controller.signal);
      const control = await api.read(this.attemptId);
      this.alive();
      if (this.view.status !== 'active') return;
      if (control.attemptId !== this.attemptId) throw new Error('Supervision identity mismatch.');
      authorizedRead = true;
      if (control.assistancePaused) {
        this.set({
          status: 'blocked',
          paper: null,
          message:
            'Workstation assistance is awaiting staff approval. Saved work and the original deadline are retained.',
        });
      }
      if (control.suspended) {
        this.set({
          status: 'blocked',
          paper: null,
          message:
            'Your administrator suspended this attempt. Ask for approval, then revalidate and reopen. Saved answers and the original deadline are retained.',
        });
      }
      if (this.view.row) {
        await this.queue;
        const row = await store.readRecord(this.view.row.key);
        if (row?.interruptions?.length) {
          const sent = row.interruptions.slice(0, 50);
          const result = await api.report(this.attemptId, sent);
          await store.acknowledgeInterruptions(
            row.key,
            result.acceptedIds.filter((id) => sent.some((e) => e.id === id)),
          );
        }
      }
    } catch (error) {
      if (this.controller.signal.aborted || this.view.status !== 'active' || authorizedRead) return;
      if (
        error instanceof ApiError &&
        (error.status === 0 || error.status === 429 || error.status >= 500)
      )
        return;
      this.set({
        status: 'blocked',
        paper: null,
        message: `${message(error)} Revalidate before continuing. Saved work is retained.`,
      });
    } finally {
      this.checkingSupervision = false;
    }
  }
  private visible = () => {
    this.interruption(document.visibilityState === 'hidden' ? 'hidden' : 'returned');
    if (document.visibilityState === 'visible') void this.checkSupervision();
    this.tick();
    if (document.visibilityState === 'visible') void this.sync();
  };
  private schedule() {
    clearTimeout(this.syncTimer);
    if (this.controller.signal.aborted) return;
    this.syncTimer = setTimeout(
      () => {
        void this.sync().finally(() => this.schedule());
      },
      Math.min(120_000, 30_000 * 2 ** this.failures) + Math.random() * 3000,
    );
  }
  private tick() {
    if (!this.clock || !this.view.row) return;
    const seconds = Math.max(
      0,
      Math.ceil((Date.parse(this.view.row.attempt.deadlineAt) - this.clock.now()) / 1000),
    );
    if (seconds !== this.view.seconds) this.set({ seconds });
    if (seconds === 0 && !this.view.row.final && ['active', 'blocked'].includes(this.view.status))
      void this.finish();
  }
  edit(itemId: string, value: string | null) {
    if (this.view.status !== 'active' || !this.view.row || !this.clock || this.view.saving) return;
    const key = this.view.row.key;
    this.set({ saving: true });
    this.queue = this.queue
      .then(async () => {
        this.alive();
        if (!this.clock || this.view.status === 'blocked') return;
        const row = await store.saveAnswer(key, itemId, value, this.clock.now());
        this.set({ row, message: 'Saved on this device.' });
      })
      .catch((error) =>
        this.set({
          message: `Answer was not saved: ${message(error)} Please keep this page open and retry.`,
        }),
      )
      .finally(() => this.set({ saving: false }));
  }
  markForReview(itemId: string, marked: boolean) {
    if (this.view.status !== 'active' || !this.view.row || !this.clock || this.view.saving) return;
    const key = this.view.row.key;
    this.set({ saving: true });
    this.queue = this.queue
      .then(async () => {
        this.alive();
        if (!this.clock || this.view.status === 'blocked') return;
        const row = await store.setReviewFlag(key, itemId, marked, this.clock.now());
        this.set({ row, message: 'Review reminder saved on this device.' });
      })
      .catch((error) => this.set({ message: `Review reminder was not saved: ${message(error)}` }))
      .finally(() => this.set({ saving: false }));
  }
  async requestAssistance(requestId: string) {
    const row = this.view.row;
    if (!row || row.final || !['active', 'blocked'].includes(this.view.status) || this.view.saving)
      throw new Error('Wait for your answer to finish saving before requesting help.');
    this.set({
      status: 'blocked',
      paper: null,
      message: 'Requesting assistance. The exam timer continues.',
    });
    await this.queue;
    this.alive();
    return assistanceApi(this.client).request(
      this.attemptId,
      requestId,
      row.attempt.deviceGeneration,
    );
  }
  async sync() {
    if (this.controller.signal.aborted || this.view.uploading) return;
    if (this.view.status === 'pending' || this.view.status === 'recovery') {
      await this.retrySubmission();
      return;
    }
    if (this.view.status !== 'active' || !this.view.row || !this.clock) return;
    this.tick();
    if (this.view.status !== 'active') return;
    this.set({ uploading: true });
    try {
      const row = await store.readRecord(this.view.row.key);
      if (!row || row.final) return;
      if (row.outbox.length) {
        const sent = row.outbox;
        const response = await this.api.save(row.attempt, sent);
        if (this.view.status !== 'active') return;
        this.clock.sync(response.serverNow);
        await store.acknowledge(row.key, sent, response);
      }
      const remote = await examApi(this.client).attempt(this.attemptId, this.controller.signal);
      if (this.view.status !== 'active') return;
      this.clock.sync(remote.serverNow);
      if (remote.state !== 'active')
        throw new Error(
          `Server state changed to ${remote.state}. Reopen to reconcile; local evidence is retained.`,
        );
      await store.reconcile(row.key, remote);
      this.set({ row: (await store.readRecord(row.key)) ?? row, message: 'Server save checked.' });
      this.failures = 0;
      this.tick();
    } catch (error) {
      if (this.view.status !== 'active') return;
      this.failures = Math.min(3, this.failures + 1);
      const temporary =
        error instanceof ApiError &&
        (error.status === 0 || error.status === 429 || error.status >= 500);
      if (temporary)
        this.set({
          message: `${message(error)} Answers remain on this device; upload will retry.`,
        });
      else if (error instanceof ApiError && error.code === 'RECOVERY_REQUIRED') {
        this.set({ uploading: false });
        await this.finish();
      } else
        this.set({
          status: 'blocked',
          message: `${message(error)} Editing stopped. Local work is retained.`,
        });
    } finally {
      this.set({ uploading: false });
    }
  }
  async finish() {
    if (this.finishing || !this.view.row || this.view.status === 'submitted') return;
    this.finishing = true;
    this.set({ status: 'finalizing', message: 'Freezing your final answers…' });
    try {
      await this.queue;
      this.alive();
      const row = await store.freeze(this.view.row.key);
      this.set({
        row,
        status: 'pending',
        message: 'Final answers saved on this device. Waiting for a matching receipt.',
      });
      await this.retrySubmission();
    } catch (error) {
      this.set({
        status: 'pending',
        message: `Could not complete final submission: ${message(error)} Keep this page open and retry.`,
      });
    } finally {
      this.finishing = false;
    }
  }
  async retrySubmission() {
    if (this.submitting || !this.view.row || this.controller.signal.aborted) return;
    if (!this.view.row.final) {
      await this.finish();
      return;
    }
    this.submitting = true;
    this.set({ uploading: true });
    try {
      const row = this.view.row;
      const frozen = row.final;
      if (!frozen) return;
      const digest = await snapshotDigest(this.attemptId, frozen.body);
      let submissionError: unknown;
      // Submit immediately: a receipt lookup must not consume the five-second allowance.
      // Retrying the persisted key/body is safe even after a lost response or deadline.
      if (!row.recovery?.receivedAt && !row.receipt) {
        try {
          const receipt = await this.api.submit(this.attemptId, frozen.body, frozen.key);
          if (receipt.snapshotDigest !== digest)
            throw new Error('Submission receipt digest mismatch. Local evidence is retained.');
          this.set({
            row: await store.recordReceipt(row.key, receipt),
            status: 'submitted',
            message: 'Your exact final answers have a committed receipt.',
          });
          this.failures = 0;
          return;
        } catch (error) {
          submissionError = error;
        }
      }
      const remote = await this.api.receipt(this.attemptId);
      if (remote.attemptId !== this.attemptId) throw new Error('Receipt attempt mismatch.');
      if (remote.receipt) {
        if (
          remote.receipt.snapshotDigest !== digest ||
          remote.receipt.finalSeq !== frozen.body.finalSeq ||
          ![frozen.key, row.recovery?.key].includes(remote.receipt.idempotencyKey)
        )
          throw new Error(
            'The server receipt does not match this device’s final answers. Contact your school; all local evidence is retained.',
          );
        this.set({
          row: await store.recordReceipt(row.key, remote.receipt),
          status: 'submitted',
          message: 'Your exact final answers have a committed receipt.',
        });
        return;
      }
      if (remote.recovery?.status === 'recovery_pending') {
        this.set({
          status: 'recovery',
          message: 'School review pending. This is not a submitted result.',
        });
        return;
      }
      if (remote.recovery?.status === 'rejected') {
        this.set({
          status: 'blocked',
          message:
            'The school rejected the recovery upload. Local evidence is retained. Contact your school.',
        });
        return;
      }
      if (remote.state === 'invalidated' || remote.state === 'submitted')
        throw new Error('This attempt is closed without a matching receipt. Contact your school.');
      throw submissionError ?? new Error('A matching receipt is not available yet.');
    } catch (error) {
      this.failures = Math.min(3, this.failures + 1);
      this.set({
        status: 'pending',
        message: `${message(error)} Final answers remain on this device. Retry to check for a receipt, or send late evidence for school review.`,
      });
    } finally {
      this.submitting = false;
      this.set({ uploading: false });
    }
  }
  async recover(reason: string) {
    if (!this.view.row?.final || this.submitting || this.view.uploading || !reason.trim()) return;
    this.submitting = true;
    this.set({ uploading: true });
    try {
      const row = await store.retainRecovery(this.view.row.key, reason.trim());
      this.set({ row });
      if (!row.final || !row.recovery) return;
      const result = await this.api.recovery(
        this.attemptId,
        row.final.body,
        row.recovery.reason,
        row.recovery.key,
      );
      this.set({
        row: await store.recordRecovery(row.key, result.receivedAt),
        status: 'recovery',
        message: 'School review pending. Your upload is evidence, not a submitted result.',
      });
    } catch (error) {
      this.set({
        message: `${message(error)} The saved recovery request is retained for an identical retry.`,
      });
    } finally {
      this.submitting = false;
      this.set({ uploading: false });
    }
  }
  dispose() {
    this.controller.abort();
    this.release?.();
    clearTimeout(this.syncTimer);
    clearInterval(this.tickTimer);
    clearInterval(this.supervisionTimer);
    window.removeEventListener('pagehide', this.pagehide);
    document.removeEventListener('fullscreenchange', this.fullscreenChanged);
    window.removeEventListener('online', this.online);
    document.removeEventListener('visibilitychange', this.visible);
    window.removeEventListener('blur', this.blurred);
  }
}
