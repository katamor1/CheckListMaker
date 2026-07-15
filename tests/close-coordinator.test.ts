import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloseCoordinator, coordinateClose } from '../src/main/close-coordinator.js';

afterEach(() => vi.useRealTimers());

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

    expect(coordinator.isGuarding).toBe(true);
    await expect(coordinator.requestFlush(send, 5000)).resolves.toBe(false);
    finishDecision(false);
    await expect(closing).resolves.toBe('canceled');
    expect(coordinator.isGuarding).toBe(false);
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
