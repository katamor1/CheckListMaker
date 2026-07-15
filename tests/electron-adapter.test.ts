import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../src/shared/ipc.js';
import { ipcSuccess, runIpcOperation, UserFacingError } from '../src/shared/ipc-result.js';
import { SESSION_INVOKE_CHANNELS, type SessionHandlerMap } from '../src/main/session-handlers.js';
import {
  registerElectronIpc,
  wireWindowCloseGuard,
  type IpcSenderEvent
} from '../src/main/electron-adapter.js';

describe('registerElectronIpc', () => {
  const createFixture = () => {
    const installed = new Map<string, (event: IpcSenderEvent, ...args: unknown[]) => Promise<unknown>>();
    const removeHandler = vi.fn();
    const installHandler = vi.fn((
      channel: string,
      listener: (event: IpcSenderEvent, ...args: unknown[]) => Promise<unknown>
    ) => {
      installed.set(channel, listener);
    });
    const runSafely = vi.fn(async (operation: () => unknown) => ipcSuccess(await operation()));
    const owner = { webContents: { id: 73 } };
    const resolveOwner = vi.fn(() => owner);
    const sessionCalls: Array<{ channel: string; senderId: number; args: unknown[] }> = [];
    const handlers = Object.fromEntries(SESSION_INVOKE_CHANNELS.map((channel) => [
      channel,
      vi.fn(async ({ senderId }: { senderId: number }, ...args: unknown[]) => {
        sessionCalls.push({ channel, senderId, args });
        return `${channel}:ok`;
      })
    ])) as SessionHandlerMap;
    const handlersFor = vi.fn(() => handlers);
    const showItem = vi.fn(async (_event: IpcSenderEvent, path: unknown) => `show:${String(path)}`);
    const versions = vi.fn(async () => ({ application: '0.1.0' }));

    registerElectronIpc({
      allChannels: Object.values(IPC),
      sessionChannels: SESSION_INVOKE_CHANNELS,
      directHandlers: [
        { channel: IPC.openFolder, operation: showItem },
        { channel: IPC.versions, operation: versions }
      ],
      removeHandler,
      installHandler,
      runSafely,
      resolveOwner,
      handlersFor,
      ownerUnavailable: () => {
        throw new UserFacingError('WINDOW_UNAVAILABLE', '処理に失敗しました。再度お試しください。');
      }
    });

    return {
      handlers,
      handlersFor,
      installHandler,
      installed,
      owner,
      removeHandler,
      resolveOwner,
      runSafely,
      sessionCalls,
      showItem,
      versions
    };
  };

  it('registers every invoke channel once through the single safe runner', async () => {
    const fixture = createFixture();
    const expected = [...SESSION_INVOKE_CHANNELS, IPC.openFolder, IPC.versions];

    expect(fixture.removeHandler.mock.calls.map(([channel]) => channel)).toEqual(Object.values(IPC));
    expect([...fixture.installed.keys()]).toEqual(expected);
    expect(new Set(fixture.installed.keys()).size).toBe(expected.length);

    const event = { sender: { id: 73 } };
    for (const channel of expected) {
      const listener = fixture.installed.get(channel);
      expect(listener).toBeDefined();
      await listener!(event, channel === IPC.newProject ? 'document_generation' : undefined);
    }
    expect(fixture.runSafely).toHaveBeenCalledTimes(expected.length);
  });

  it('maps the exact event sender to its window and forwards its webContents id', async () => {
    const fixture = createFixture();
    const sender = { id: 73 };
    const event = { sender };

    await expect(
      fixture.installed.get(IPC.newProject)!(event, 'document_generation')
    ).resolves.toEqual(ipcSuccess(`${IPC.newProject}:ok`));

    expect(fixture.resolveOwner).toHaveBeenCalledWith(sender);
    expect(fixture.handlersFor).toHaveBeenCalledWith(fixture.owner);
    expect(fixture.handlers[IPC.newProject]).toHaveBeenCalledWith(
      { senderId: fixture.owner.webContents.id },
      'document_generation'
    );
    expect(fixture.sessionCalls[0]).toEqual({
      channel: IPC.newProject,
      senderId: 73,
      args: ['document_generation']
    });
  });

  it('converts a missing owner through the same safe wrapper', async () => {
    const installed = new Map<string, (event: IpcSenderEvent) => Promise<unknown>>();
    registerElectronIpc({
      allChannels: Object.values(IPC),
      sessionChannels: SESSION_INVOKE_CHANNELS,
      directHandlers: [],
      removeHandler: vi.fn(),
      installHandler: (channel, listener) => { installed.set(channel, listener); },
      runSafely: (operation) => runIpcOperation(operation),
      resolveOwner: vi.fn(() => undefined),
      handlersFor: vi.fn(),
      ownerUnavailable: () => {
        throw new UserFacingError('WINDOW_UNAVAILABLE', '処理に失敗しました。再度お試しください。');
      }
    });

    await expect(installed.get(IPC.openProject)!({ sender: { id: 99 } })).resolves.toEqual({
      ok: false,
      error: { code: 'WINDOW_UNAVAILABLE', message: '処理に失敗しました。再度お試しください。' }
    });
  });
});

describe('wireWindowCloseGuard', () => {
  const createFixture = (outcome: 'approved' | 'canceled' | 'flush-timeout' = 'canceled') => {
    let closeListener: ((event: { preventDefault(): void }) => void) | undefined;
    let closedListener: (() => void) | undefined;
    const coordinator = {
      closeApproved: false,
      isGuarding: false,
      abortClose: vi.fn()
    };
    const coordinators = new Map<number, typeof coordinator>();
    const send = vi.fn();
    const guardUnsaved = vi.fn().mockResolvedValue(true);
    const coordinate = vi.fn(async (
      active: typeof coordinator,
      sendFlush: (requestId: string) => void,
      guard: () => Promise<boolean>
    ) => {
      sendFlush('REQ-EXACT');
      await guard();
      if (outcome === 'approved') active.closeApproved = true;
      return outcome;
    });
    const reentered = { preventDefault: vi.fn() };
    const close = vi.fn(() => closeListener?.(reentered));
    const showError = vi.fn().mockResolvedValue(undefined);
    const reportUnexpected = vi.fn();
    const isDestroyed = vi.fn(() => false);

    wireWindowCloseGuard({
      senderId: 73,
      coordinator,
      coordinators,
      onClose: (listener) => { closeListener = listener; },
      onClosed: (listener) => { closedListener = listener; },
      send,
      isDestroyed,
      close,
      coordinate,
      guardUnsaved,
      showError,
      reportUnexpected,
      timeoutMs: 5_000,
      timeoutMessage: 'flush timeout',
      genericMessage: 'generic failure'
    });

    return {
      close,
      closeEvent: { preventDefault: vi.fn() },
      closeListener: () => closeListener!,
      closedListener: () => closedListener!,
      coordinator,
      coordinators,
      coordinate,
      guardUnsaved,
      isDestroyed,
      reentered,
      reportUnexpected,
      send,
      showError
    };
  };

  it('indexes by webContents id, echoes the exact cancel id, and cleans up on closed', async () => {
    const fixture = createFixture('canceled');
    expect(fixture.coordinators.get(73)).toBe(fixture.coordinator);

    fixture.closeListener()(fixture.closeEvent);
    expect(fixture.closeEvent.preventDefault).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(fixture.send).toHaveBeenCalledTimes(2));
    expect(fixture.send.mock.calls).toEqual([
      [IPC.flushBeforeClose, 'REQ-EXACT'],
      [IPC.closeCanceled, 'REQ-EXACT']
    ]);
    expect(fixture.close).not.toHaveBeenCalled();

    fixture.closedListener()();
    expect(fixture.coordinators.has(73)).toBe(false);
  });

  it('allows approved close re-entry and ignores a repeated close while guarding', async () => {
    const fixture = createFixture('approved');
    fixture.closeListener()(fixture.closeEvent);
    await vi.waitFor(() => expect(fixture.close).toHaveBeenCalledOnce());
    expect(fixture.reentered.preventDefault).not.toHaveBeenCalled();

    const guarding = createFixture('canceled');
    guarding.coordinator.isGuarding = true;
    guarding.closeListener()(guarding.closeEvent);
    expect(guarding.closeEvent.preventDefault).toHaveBeenCalledOnce();
    expect(guarding.coordinate).not.toHaveBeenCalled();
  });

  it('cancels with the captured id on timeout and sanitizes thrown coordination failures', async () => {
    const timeout = createFixture('flush-timeout');
    timeout.closeListener()(timeout.closeEvent);
    await vi.waitFor(() => expect(timeout.showError).toHaveBeenCalledWith('flush timeout'));
    expect(timeout.send).toHaveBeenNthCalledWith(2, IPC.closeCanceled, 'REQ-EXACT');

    const failed = createFixture('canceled');
    const cause = new Error('C:\\secret\\close stack');
    failed.coordinate.mockImplementation(async (_coordinator, sendFlush) => {
      sendFlush('REQ-FAIL');
      throw cause;
    });
    failed.closeListener()(failed.closeEvent);
    await vi.waitFor(() => expect(failed.showError).toHaveBeenCalledWith('generic failure'));
    expect(failed.coordinator.abortClose).toHaveBeenCalledOnce();
    expect(failed.send).toHaveBeenNthCalledWith(2, IPC.closeCanceled, 'REQ-FAIL');
    expect(failed.reportUnexpected).toHaveBeenCalledWith(cause);
  });
});
