import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloseCoordinator, coordinateClose } from '../src/main/close-coordinator.js';

afterEach(() => {
  if (vi.isFakeTimers()) vi.clearAllTimers();
  vi.useRealTimers();
});

describe('CloseCoordinator', () => {
  it('resolves only a matching flush acknowledgement', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-1');
    const send = vi.fn();
    const pending = coordinator.requestFlush(send, 5000);

    coordinator.acknowledge('OTHER');
    expect(coordinator.isGuarding).toBe(true);
    coordinator.acknowledge('REQ-1');

    await expect(pending).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith('REQ-1');
  });

  it('times out without allowing close', async () => {
    vi.useFakeTimers();
    const coordinator = new CloseCoordinator(() => 'REQ-2');
    const pending = coordinator.requestFlush(vi.fn(), 5000);

    await vi.advanceTimersByTimeAsync(5000);

    await expect(pending).resolves.toBe(false);
    expect(coordinator.closeApproved).toBe(false);
    expect(coordinator.isGuarding).toBe(false);
  });

  it('returns a coordinated timeout without invoking the unsaved guard', async () => {
    vi.useFakeTimers();
    const coordinator = new CloseCoordinator(() => 'REQ-COORDINATED-TIMEOUT');
    const guardUnsaved = vi.fn().mockResolvedValue(true);

    try {
      const closing = coordinateClose(coordinator, vi.fn(), guardUnsaved, 5000);
      await vi.advanceTimersByTimeAsync(5000);

      await expect(closing).resolves.toBe('flush-timeout');
      expect(guardUnsaved).not.toHaveBeenCalled();
      expect(coordinator.closeApproved).toBe(false);
      expect(coordinator.isGuarding).toBe(false);
    } finally {
      coordinator.abortClose();
    }
  });

  it('returns to idle after a timeout so the next close can succeed', async () => {
    vi.useFakeTimers();
    let request = 0;
    const coordinator = new CloseCoordinator(() => `REQ-${++request}`);
    const first = coordinator.requestFlush(vi.fn(), 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(first).resolves.toBe(false);

    const retry = coordinator.requestFlush(vi.fn(), 5000);
    coordinator.acknowledge('REQ-2');

    await expect(retry).resolves.toBe(true);
    coordinator.cancelClose();
    expect(coordinator.isGuarding).toBe(false);
  });

  it('deduplicates concurrent close requests', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-3');
    const send = vi.fn();
    const first = coordinator.requestFlush(send, 5000);
    const second = coordinator.requestFlush(send, 5000);

    coordinator.acknowledge('REQ-3');

    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it('coordinates overlapping closes with one flush and one unsaved guard', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-OVERLAP');
    const send = vi.fn();
    const guardUnsaved = vi.fn().mockResolvedValue(true);

    const first = coordinateClose(coordinator, send, guardUnsaved, 5000);
    const reentry = coordinateClose(coordinator, send, guardUnsaved, 5000);
    expect(send).toHaveBeenCalledOnce();
    coordinator.acknowledge('REQ-OVERLAP');

    await expect(Promise.all([first, reentry])).resolves.toEqual([
      'approved',
      'flush-timeout'
    ]);
    expect(guardUnsaved).toHaveBeenCalledOnce();
    expect(coordinator.closeApproved).toBe(true);
  });

  it('stays guarded after flush acknowledgement while the unsaved decision is pending', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-4');
    let finishDecision!: (value: boolean) => void;
    const decision = new Promise<boolean>((resolve) => {
      finishDecision = resolve;
    });
    const send = vi.fn();
    const closing = coordinateClose(coordinator, send, () => decision, 5000);
    coordinator.acknowledge('REQ-4');
    await Promise.resolve();

    try {
      expect(coordinator.isGuarding).toBe(true);
      await expect(coordinator.requestFlush(send, 5000)).resolves.toBe(false);
    } finally {
      finishDecision(false);
    }
    await expect(closing).resolves.toBe('canceled');
    expect(coordinator.isGuarding).toBe(false);
  });

  it('keeps cancellation non-approved and coordinates a fresh later close', async () => {
    let request = 0;
    const coordinator = new CloseCoordinator(() => `REQ-CANCEL-${++request}`);
    const send = vi.fn();
    const cancelGuard = vi.fn().mockResolvedValue(false);
    const canceled = coordinateClose(coordinator, send, cancelGuard, 5000);
    coordinator.acknowledge('REQ-CANCEL-1');

    await expect(canceled).resolves.toBe('canceled');
    expect(coordinator.closeApproved).toBe(false);
    expect(cancelGuard).toHaveBeenCalledOnce();

    const approveGuard = vi.fn().mockResolvedValue(true);
    const retry = coordinateClose(coordinator, send, approveGuard, 5000);
    expect(send).toHaveBeenNthCalledWith(2, 'REQ-CANCEL-2');
    coordinator.acknowledge('REQ-CANCEL-2');

    await expect(retry).resolves.toBe('approved');
    expect(approveGuard).toHaveBeenCalledOnce();
    expect(coordinator.closeApproved).toBe(true);
  });

  it('approves close only after flush and the shared guard both succeed', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-5');
    const closing = coordinateClose(
      coordinator,
      vi.fn(),
      vi.fn().mockResolvedValue(true),
      5000
    );

    coordinator.acknowledge('REQ-5');

    await expect(closing).resolves.toBe('approved');
    expect(coordinator.closeApproved).toBe(true);
  });

  it('returns to idle when sending the flush request throws', async () => {
    let request = 5;
    const coordinator = new CloseCoordinator(() => `REQ-${++request}`);

    await expect(
      coordinator.requestFlush(() => {
        throw new Error('window destroyed');
      }, 5000)
    ).rejects.toThrow('window destroyed');
    expect(coordinator.isGuarding).toBe(false);

    const retry = coordinator.requestFlush(vi.fn(), 5000);
    coordinator.acknowledge('REQ-7');
    await expect(retry).resolves.toBe(true);
  });

  it('clears an acknowledged request deadline before starting the next flush', async () => {
    vi.useFakeTimers();
    let request = 0;
    const coordinator = new CloseCoordinator(() => `REQ-ACK-CLEANUP-${++request}`);
    const first = coordinator.requestFlush(vi.fn(), 100);
    coordinator.acknowledge('REQ-ACK-CLEANUP-1');
    await expect(first).resolves.toBe(true);
    coordinator.cancelClose();

    coordinator.acknowledge('REQ-ACK-CLEANUP-1');
    expect(coordinator.isGuarding).toBe(false);
    const retry = coordinator.requestFlush(vi.fn(), 1000);
    let retrySettled = false;
    void retry.then(() => {
      retrySettled = true;
    });

    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(coordinator.isGuarding).toBe(true);
      expect(retrySettled).toBe(false);

      coordinator.acknowledge('REQ-ACK-CLEANUP-2');
      await expect(retry).resolves.toBe(true);
    } finally {
      coordinator.abortClose();
    }
  });

  it('clears a failed send deadline before starting the next flush', async () => {
    vi.useFakeTimers();
    let request = 0;
    const coordinator = new CloseCoordinator(() => `REQ-SEND-CLEANUP-${++request}`);
    await expect(
      coordinator.requestFlush(() => {
        throw new Error('window unavailable');
      }, 100)
    ).rejects.toThrow('window unavailable');

    coordinator.acknowledge('REQ-SEND-CLEANUP-1');
    expect(coordinator.isGuarding).toBe(false);
    const retry = coordinator.requestFlush(vi.fn(), 1000);
    let retrySettled = false;
    void retry.then(() => {
      retrySettled = true;
    });

    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(coordinator.isGuarding).toBe(true);
      expect(retrySettled).toBe(false);

      coordinator.acknowledge('REQ-SEND-CLEANUP-2');
      await expect(retry).resolves.toBe(true);
    } finally {
      coordinator.abortClose();
    }
  });

  it('ignores a late acknowledgement after timeout without releasing the next request', async () => {
    vi.useFakeTimers();
    let request = 0;
    const coordinator = new CloseCoordinator(() => `REQ-LATE-ACK-${++request}`);
    const timedOut = coordinator.requestFlush(vi.fn(), 100);
    await vi.advanceTimersByTimeAsync(100);
    await expect(timedOut).resolves.toBe(false);

    const retry = coordinator.requestFlush(vi.fn(), 1000);
    let retrySettled = false;
    void retry.then(() => {
      retrySettled = true;
    });

    try {
      coordinator.acknowledge('REQ-LATE-ACK-1');
      await Promise.resolve();
      expect(retrySettled).toBe(false);
      expect(coordinator.isGuarding).toBe(true);

      coordinator.acknowledge('REQ-LATE-ACK-2');
      await expect(retry).resolves.toBe(true);
    } finally {
      coordinator.abortClose();
    }
  });

  it('aborts a pending flush as false and cleans up before retry', async () => {
    vi.useFakeTimers();
    let request = 0;
    const coordinator = new CloseCoordinator(() => `REQ-ABORT-${++request}`);
    const pending = coordinator.requestFlush(vi.fn(), 100);
    let abortResult: boolean | undefined;
    void pending.then((result) => {
      abortResult = result;
    });

    coordinator.abortClose();
    await Promise.resolve();
    expect(abortResult).toBe(false);
    expect(coordinator.isGuarding).toBe(false);
    expect(coordinator.closeApproved).toBe(false);
    coordinator.acknowledge('REQ-ABORT-1');
    expect(coordinator.isGuarding).toBe(false);

    const retry = coordinator.requestFlush(vi.fn(), 1000);
    let retrySettled = false;
    void retry.then(() => {
      retrySettled = true;
    });

    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(coordinator.isGuarding).toBe(true);
      expect(retrySettled).toBe(false);

      coordinator.acknowledge('REQ-ABORT-2');
      await expect(retry).resolves.toBe(true);
    } finally {
      coordinator.abortClose();
    }
  });

  it('returns to idle when the unsaved guard rejects so a later close can retry', async () => {
    let request = 7;
    const coordinator = new CloseCoordinator(() => `REQ-${++request}`);
    const failed = coordinateClose(
      coordinator,
      vi.fn(),
      vi.fn().mockRejectedValue(new Error('guard unavailable')),
      5000
    );
    coordinator.acknowledge('REQ-8');

    await expect(failed).rejects.toThrow('guard unavailable');
    expect(coordinator.isGuarding).toBe(false);
    expect(coordinator.closeApproved).toBe(false);

    const retry = coordinator.requestFlush(vi.fn(), 5000);
    coordinator.acknowledge('REQ-9');
    await expect(retry).resolves.toBe(true);
  });
});
