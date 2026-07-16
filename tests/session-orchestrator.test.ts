import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { SessionSnapshot } from '../src/shared/model.js';
import { GENERIC_USER_PRESENTATION } from '../src/shared/ipc-result.js';
import { userFacingErrors } from '../src/shared/presentation/ja/index.js';
import { DraftSynchronizer } from '../src/renderer/draft-synchronizer.js';
import { SessionOperationQueue } from '../src/renderer/session-operation-queue.js';
import {
  RendererSessionOrchestrator,
  safeRendererError
} from '../src/renderer/session-orchestrator.js';

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const snapshot = (revision = 0): SessionSnapshot => ({
  project: createProject('document_generation'),
  dirty: false,
  revision
});

const createBridge = () => {
  let flushListener: ((requestId: string) => void) | undefined;
  let canceledListener: ((requestId: string) => void) | undefined;
  const unsubscribeFlush = vi.fn();
  const unsubscribeCanceled = vi.fn();
  return {
    bridge: {
      onFlushBeforeClose: vi.fn((listener: (requestId: string) => void) => {
        flushListener = listener;
        return unsubscribeFlush;
      }),
      onCloseCanceled: vi.fn((listener: (requestId: string) => void) => {
        canceledListener = listener;
        return unsubscribeCanceled;
      }),
      closeReady: vi.fn().mockResolvedValue(undefined)
    },
    canceledListener: () => canceledListener!,
    flushListener: () => flushListener!,
    unsubscribeCanceled,
    unsubscribeFlush
  };
};

describe('RendererSessionOrchestrator', () => {
  it('acquires synchronously, flushes, and invokes exactly one Main action', async () => {
    const calls: string[] = [];
    const queue = new SessionOperationQueue();
    const synchronizer = {
      enqueue: vi.fn(),
      reset: vi.fn(),
      flush: vi.fn(async () => { calls.push('flush'); })
    };
    const bridge = createBridge();
    const orchestrator = new RendererSessionOrchestrator({
      bridge: bridge.bridge,
      summaryRef: { current: snapshot() },
      synchronizer,
      operationQueue: queue,
      publishSummary: vi.fn(),
      reportError: vi.fn()
    });
    const action = vi.fn(async () => {
      calls.push('action');
      return 'result';
    });

    const result = orchestrator.runSessionOperation(action);
    expect(queue.blocked).toBe(true);
    expect(action).not.toHaveBeenCalled();
    await expect(result).resolves.toBe('result');

    expect(calls).toEqual(['flush', 'action']);
    expect(action).toHaveBeenCalledOnce();
    expect(queue.blocked).toBe(false);
  });

  it('reads and publishes the latest summary ref without updater side effects', () => {
    const summaryRef = { current: snapshot() as SessionSnapshot | null };
    const publishSummary = vi.fn((next: SessionSnapshot) => { summaryRef.current = next; });
    const send = vi.fn(async (_project, revision: number) => ({ accepted: true, revision }));
    const synchronizer = new DraftSynchronizer(send, 0);
    const orchestrator = new RendererSessionOrchestrator({
      bridge: createBridge().bridge,
      summaryRef,
      synchronizer,
      operationQueue: new SessionOperationQueue(),
      publishSummary,
      reportError: vi.fn()
    });

    orchestrator.commitProject((current) => ({ ...current, name: 'latest name' }));
    orchestrator.commitProject((current) => ({
      ...current,
      generation: { ...current.generation!, instructions: 'latest instructions' }
    }));

    expect(summaryRef.current?.project.name).toBe('latest name');
    expect(summaryRef.current?.project.generation?.instructions).toBe('latest instructions');
    expect(summaryRef.current?.revision).toBe(2);
    expect(publishSummary).toHaveBeenCalledTimes(2);
  });

  it('adopts Main snapshots and refuses edits while the operation barrier is active', async () => {
    const current = snapshot(2);
    const summaryRef = { current: current as SessionSnapshot | null };
    const publishSummary = vi.fn((next: SessionSnapshot) => { summaryRef.current = next; });
    const synchronizer = {
      enqueue: vi.fn(),
      reset: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined)
    };
    const queue = new SessionOperationQueue();
    const orchestrator = new RendererSessionOrchestrator({
      bridge: createBridge().bridge,
      summaryRef,
      synchronizer,
      operationQueue: queue,
      publishSummary,
      reportError: vi.fn()
    });
    const adopted = { ...current, revision: 9, dirty: false };
    orchestrator.adoptSummary(adopted);
    expect(synchronizer.reset).toHaveBeenCalledWith(9);
    expect(summaryRef.current).toBe(adopted);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = queue.run(() => gate);
    const before = summaryRef.current;
    expect(orchestrator.commitProject((project) => ({ ...project, name: 'blocked' }))).toBe(before);
    expect(synchronizer.enqueue).not.toHaveBeenCalled();
    release();
    await pending;
  });

  it('owns close subscriptions, matching cancellation, unsubscription, and disposal', async () => {
    const bridge = createBridge();
    const queue = new SessionOperationQueue();
    const dispose = vi.spyOn(queue, 'dispose');
    const synchronizer = {
      enqueue: vi.fn(),
      reset: vi.fn(),
      flush: vi.fn().mockResolvedValue(undefined)
    };
    const orchestrator = new RendererSessionOrchestrator({
      bridge: bridge.bridge,
      summaryRef: { current: snapshot() },
      synchronizer,
      operationQueue: queue,
      publishSummary: vi.fn(),
      reportError: vi.fn()
    });

    const cleanup = orchestrator.subscribeClose();
    bridge.flushListener()('REQ-MATCH');
    await vi.waitFor(() => expect(bridge.bridge.closeReady).toHaveBeenCalledWith('REQ-MATCH'));
    expect(queue.blocked).toBe(true);
    bridge.canceledListener()('REQ-OTHER');
    expect(queue.blocked).toBe(true);
    bridge.canceledListener()('REQ-MATCH');
    expect(queue.blocked).toBe(false);

    cleanup();
    expect(bridge.unsubscribeFlush).toHaveBeenCalledOnce();
    expect(bridge.unsubscribeCanceled).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('reports a close flush failure without acknowledging it', async () => {
    const bridge = createBridge();
    const failure = new Error('sync failed');
    const reportError = vi.fn();
    const orchestrator = new RendererSessionOrchestrator({
      bridge: bridge.bridge,
      summaryRef: { current: snapshot() },
      synchronizer: {
        enqueue: vi.fn(),
        reset: vi.fn(),
        flush: vi.fn().mockRejectedValue(failure)
      },
      operationQueue: new SessionOperationQueue(),
      publishSummary: vi.fn(),
      reportError
    });

    orchestrator.subscribeClose();
    bridge.flushListener()('REQ-FAIL');
    await vi.waitFor(() => expect(reportError).toHaveBeenCalledWith(failure));
    expect(bridge.bridge.closeReady).not.toHaveBeenCalled();
  });

  it('keeps the busy barrier reusable after StrictMode setup-cleanup-setup replay', async () => {
    const bridge = createBridge();
    const blockedChanges: boolean[] = [];
    const queue = new SessionOperationQueue((blocked) => blockedChanges.push(blocked));
    const orchestrator = new RendererSessionOrchestrator({
      bridge: bridge.bridge,
      summaryRef: { current: snapshot() },
      synchronizer: {
        enqueue: vi.fn(),
        reset: vi.fn(),
        flush: vi.fn().mockResolvedValue(undefined)
      },
      operationQueue: queue,
      publishSummary: vi.fn(),
      reportError: vi.fn()
    });

    const firstCleanup = orchestrator.subscribeClose();
    firstCleanup();
    firstCleanup();
    expect(bridge.unsubscribeFlush).toHaveBeenCalledOnce();
    expect(bridge.unsubscribeCanceled).toHaveBeenCalledOnce();

    const secondCleanup = orchestrator.subscribeClose();
    const operation = orchestrator.runSessionOperation(async () => 'complete');
    expect(queue.blocked).toBe(true);
    expect(blockedChanges).toEqual([true]);
    await expect(operation).resolves.toBe('complete');
    expect(queue.blocked).toBe(false);
    expect(blockedChanges).toEqual([true, false]);

    secondCleanup();
    expect(bridge.unsubscribeFlush).toHaveBeenCalledTimes(2);
    expect(bridge.unsubscribeCanceled).toHaveBeenCalledTimes(2);
  });

  it('suppresses stale close acknowledgement and errors after a pending flush is canceled', async () => {
    const bridge = createBridge();
    const resolveGate = deferred();
    const rejectGate = deferred();
    const staleFailure = new Error('stale close flush failed');
    const synchronizer = {
      enqueue: vi.fn(),
      reset: vi.fn(),
      flush: vi.fn()
        .mockImplementationOnce(() => resolveGate.promise)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockImplementationOnce(() => rejectGate.promise)
        .mockResolvedValueOnce(undefined)
    };
    const queue = new SessionOperationQueue();
    const reportError = vi.fn();
    const orchestrator = new RendererSessionOrchestrator({
      bridge: bridge.bridge,
      summaryRef: { current: snapshot() },
      synchronizer,
      operationQueue: queue,
      publishSummary: vi.fn(),
      reportError
    });
    const unhandled: unknown[] = [];
    const observeUnhandled = (reason: unknown): void => { unhandled.push(reason); };
    process.on('unhandledRejection', observeUnhandled);
    const cleanup = orchestrator.subscribeClose();

    try {
      bridge.flushListener()('REQ-STALE-RESOLVE');
      await vi.waitFor(() => expect(synchronizer.flush).toHaveBeenCalledTimes(1));
      bridge.canceledListener()('REQ-STALE-RESOLVE');

      const regular = vi.fn().mockResolvedValue('regular-complete');
      const regularResult = orchestrator.runSessionOperation(regular);
      await vi.waitFor(() => expect(regular).toHaveBeenCalledOnce(), { timeout: 500 });
      await expect(regularResult).resolves.toBe('regular-complete');

      bridge.flushListener()('REQ-FRESH');
      await vi.waitFor(() => expect(bridge.bridge.closeReady).toHaveBeenCalledWith('REQ-FRESH'));
      bridge.canceledListener()('REQ-FRESH');
      resolveGate.resolve();
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(bridge.bridge.closeReady).not.toHaveBeenCalledWith('REQ-STALE-RESOLVE');

      bridge.flushListener()('REQ-STALE-REJECT');
      await vi.waitFor(() => expect(synchronizer.flush).toHaveBeenCalledTimes(4));
      bridge.canceledListener()('REQ-STALE-REJECT');
      const afterRejectCancel = orchestrator.runSessionOperation(async () => 'after-reject-cancel');
      await expect(afterRejectCancel).resolves.toBe('after-reject-cancel');
      rejectGate.reject(staleFailure);
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(reportError).not.toHaveBeenCalledWith(staleFailure);
      expect(bridge.bridge.closeReady).not.toHaveBeenCalledWith('REQ-STALE-REJECT');
      expect(unhandled).toEqual([]);
    } finally {
      resolveGate.resolve();
      rejectGate.resolve();
      cleanup();
      process.off('unhandledRejection', observeUnhandled);
    }
  });
});

describe('safeRendererError', () => {
  it('keeps only a branded structured presentation with an approved code', () => {
    const trusted = {
      brand: 'checklistmaker.renderer-user-error.v1',
      code: 'PROJECT_SAVE_FAILED',
      presentation: userFacingErrors.projectSaveFailed
    };

    expect(safeRendererError(trusted)).toEqual({
      code: 'PROJECT_SAVE_FAILED',
      presentation: userFacingErrors.projectSaveFailed
    });

    const mismatched = {
      brand: 'checklistmaker.renderer-user-error.v1',
      code: 'PROJECT_SAVE_FAILED',
      presentation: {
        title: '秘密',
        message: 'Cannot read properties of undefined',
        extra: true
      }
    };
    expect(safeRendererError(mismatched)).toEqual({
      code: 'INTERNAL_ERROR',
      presentation: GENERIC_USER_PRESENTATION
    });
  });

  it('genericizes every untrusted Error message and every non-Error value', () => {
    const untrusted: unknown[] = [
      new Error('文書を登録できませんでした。ファイルを確認してください。'),
      new Error('\\\\server\\share\\customer.clmproj'),
      new Error('/etc/customer.conf'),
      new Error('unknown-ipc:private-action'),
      new TypeError('Cannot read properties of undefined'),
      new Error('operation failed\n    at internal stack'),
      { message: '文書を登録できませんでした。ファイルを確認してください。' },
      '文書を登録できませんでした。ファイルを確認してください。',
      null
    ];

    for (const error of untrusted) {
      expect(safeRendererError(error)).toEqual({
        code: 'INTERNAL_ERROR',
        presentation: GENERIC_USER_PRESENTATION
      });
    }
  });
});
