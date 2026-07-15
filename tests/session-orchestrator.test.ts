import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { SessionSnapshot } from '../src/shared/model.js';
import { DraftSynchronizer } from '../src/renderer/draft-synchronizer.js';
import { SessionOperationQueue } from '../src/renderer/session-operation-queue.js';
import {
  RendererSessionOrchestrator,
  safeRendererErrorMessage
} from '../src/renderer/session-orchestrator.js';

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
});

describe('safeRendererErrorMessage', () => {
  it('keeps fixed user messages and rejects raw paths, stacks, and IPC channels', () => {
    expect(safeRendererErrorMessage(new Error('文書を登録できませんでした。ファイルを確認してください。')))
      .toBe('文書を登録できませんでした。ファイルを確認してください。');
    expect(safeRendererErrorMessage(new Error(
      "Error invoking remote method 'project:save': C:\\secret\\customer.clmproj\n    at stack"
    ))).toBe('処理に失敗しました。再度お試しください。');
    expect(safeRendererErrorMessage({ message: 'C:\\secret\\plain object' }))
      .toBe('処理に失敗しました。再度お試しください。');
  });
});
