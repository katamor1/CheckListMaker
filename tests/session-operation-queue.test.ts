import { describe, expect, it, vi } from 'vitest';
import { SessionOperationQueue } from '../src/renderer/session-operation-queue.js';

const deferred = <T = void>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('SessionOperationQueue', () => {
  it('serializes concurrent operations and holds blocked until both tokens release', async () => {
    const firstGate = deferred();
    const secondGate = deferred();
    const calls: string[] = [];
    const blockedChanges: boolean[] = [];
    const queue = new SessionOperationQueue((blocked) => blockedChanges.push(blocked));

    const first = queue.run(async () => {
      calls.push('first:start');
      await firstGate.promise;
      calls.push('first:end');
      return 'first';
    });
    const second = queue.run(async () => {
      calls.push('second:start');
      await secondGate.promise;
      calls.push('second:end');
      return 'second';
    });

    expect(queue.blocked).toBe(true);
    expect(blockedChanges).toEqual([true]);
    await vi.waitFor(() => expect(calls).toEqual(['first:start']));
    firstGate.resolve();
    await expect(first).resolves.toBe('first');
    await vi.waitFor(() => expect(calls).toContain('second:start'));
    expect(queue.blocked).toBe(true);
    expect(blockedChanges).toEqual([true]);

    secondGate.resolve();
    await expect(second).resolves.toBe('second');
    expect(calls).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    expect(queue.blocked).toBe(false);
    expect(blockedChanges).toEqual([true, false]);
  });

  it('continues the settled tail after an earlier operation rejects', async () => {
    const calls: string[] = [];
    const queue = new SessionOperationQueue();
    const first = queue.run(async () => {
      calls.push('first');
      throw new Error('first failed');
    });
    const firstRejected = expect(first).rejects.toThrow('first failed');
    const second = queue.run(async () => {
      calls.push('second');
      return 2;
    });

    await firstRejected;
    await expect(second).resolves.toBe(2);
    expect(calls).toEqual(['first', 'second']);
    expect(queue.blocked).toBe(false);
  });

  it('waits for an active operation, flushes close once, and rejects later operations', async () => {
    const activeGate = deferred();
    const activeStarted = deferred();
    const flushGate = deferred();
    const calls: string[] = [];
    const queue = new SessionOperationQueue();
    const active = queue.run(async () => {
      calls.push('active:start');
      activeStarted.resolve();
      await activeGate.promise;
      calls.push('active:end');
    });
    await activeStarted.promise;
    const flush = vi.fn(async () => {
      calls.push('flush:start');
      await flushGate.promise;
      calls.push('flush:end');
    });

    const closing = queue.beginClose('REQ-1', flush);
    const duplicate = queue.beginClose('REQ-1', flush);
    await expect(queue.run(async () => undefined)).rejects.toThrow(
      '終了確認中のため、新しい操作を開始できません。'
    );
    expect(flush).not.toHaveBeenCalled();

    activeGate.resolve();
    await active;
    await vi.waitFor(() => expect(flush).toHaveBeenCalledOnce());
    expect(calls).toEqual(['active:start', 'active:end', 'flush:start']);
    flushGate.resolve();
    await expect(closing).resolves.toBeUndefined();
    await expect(duplicate).resolves.toBeUndefined();
    expect(flush).toHaveBeenCalledOnce();
    expect(queue.blocked).toBe(true);

    queue.cancelClose('REQ-1');
    expect(queue.blocked).toBe(false);
  });

  it('releases only matching tokens, ignores duplicate cancel, and disposes silently', async () => {
    const operationGate = deferred();
    const operationStarted = deferred();
    const blockedChanges: boolean[] = [];
    const queue = new SessionOperationQueue((blocked) => blockedChanges.push(blocked));
    const operation = queue.run(async () => {
      operationStarted.resolve();
      await operationGate.promise;
    });
    await operationStarted.promise;
    const closing = queue.beginClose('REQ-A', async () => undefined);

    queue.cancelClose('REQ-B');
    expect(queue.blocked).toBe(true);
    queue.cancelClose('REQ-A');
    queue.cancelClose('REQ-A');
    expect(queue.blocked).toBe(true);

    operationGate.resolve();
    await operation;
    await closing;
    expect(queue.blocked).toBe(false);
    expect(blockedChanges).toEqual([true, false]);

    const pendingClose = queue.beginClose('REQ-DISPOSE', async () => undefined);
    await pendingClose;
    expect(queue.blocked).toBe(true);
    queue.dispose();
    expect(queue.blocked).toBe(false);
    expect(blockedChanges).toEqual([true, false, true]);
    queue.cancelClose('REQ-DISPOSE');
    expect(blockedChanges).toEqual([true, false, true]);
  });

  it('rejects a different close request without releasing the active close token', async () => {
    const queue = new SessionOperationQueue();
    await queue.beginClose('REQ-1', async () => undefined);

    await expect(queue.beginClose('REQ-2', async () => undefined)).rejects.toThrow(
      '終了確認中のため、新しい操作を開始できません。'
    );
    queue.cancelClose('REQ-2');
    expect(queue.blocked).toBe(true);
    queue.cancelClose('REQ-1');
    expect(queue.blocked).toBe(false);
  });

  it('detaches a matching canceled close from the serial tail while its flush is pending', async () => {
    const flushStarted = deferred();
    const releaseOldFlush = deferred();
    const calls: string[] = [];
    const queue = new SessionOperationQueue();
    const oldClose = queue.beginClose('REQ-OLD', async () => {
      calls.push('old-flush:start');
      flushStarted.resolve();
      await releaseOldFlush.promise;
      calls.push('old-flush:end');
    });

    await flushStarted.promise;
    queue.cancelClose('REQ-OLD');

    const regular = queue.run(async () => {
      calls.push('regular');
      return 'regular-complete';
    });
    await vi.waitFor(() => expect(calls).toContain('regular'), { timeout: 500 });
    await expect(regular).resolves.toBe('regular-complete');

    const freshClose = queue.beginClose('REQ-FRESH', async () => {
      calls.push('fresh-flush');
    });
    await vi.waitFor(() => expect(calls).toContain('fresh-flush'), { timeout: 500 });
    await expect(freshClose).resolves.toBeUndefined();
    expect(calls).toEqual(['old-flush:start', 'regular', 'fresh-flush']);

    queue.cancelClose('REQ-FRESH');
    releaseOldFlush.resolve();
    await oldClose;
    expect(queue.blocked).toBe(false);
  });
});
