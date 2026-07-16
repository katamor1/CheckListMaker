import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../src/shared/ipc.js';
import { GENERIC_USER_PRESENTATION, ipcSuccess } from '../src/shared/ipc-result.js';
import { userFacingErrors } from '../src/shared/presentation/ja/index.js';
import {
  registerMainIpcBindings
} from '../src/main/main-ipc-bindings.js';
import {
  SESSION_INVOKE_CHANNELS,
  type SessionHandlerMap
} from '../src/main/session-handlers.js';
import type { IpcSenderEvent } from '../src/main/electron-adapter.js';

describe('registerMainIpcBindings', () => {
  const createFixture = () => {
    const installed = new Map<
      string,
      (event: IpcSenderEvent, ...args: unknown[]) => Promise<unknown>
    >();
    const removeHandler = vi.fn();
    const owner = { webContents: { id: 73 } };
    const resolveOwner = vi.fn((sender: { id: number }) => sender.id === 73 ? owner : undefined);
    const handlers = Object.fromEntries(SESSION_INVOKE_CHANNELS.map((channel) => [
      channel,
      vi.fn(async ({ senderId }: { senderId: number }, ...args: unknown[]) => ({
        channel,
        senderId,
        args
      }))
    ])) as SessionHandlerMap;
    const handlersFor = vi.fn(() => handlers);
    const allowedOutputPaths = new Set(['C:\\allowed\\package.zip']);
    const showItemInFolder = vi.fn();
    const versions = {
      application: '0.1.0',
      electron: '41.2.1',
      node: '24.10.0',
      chrome: '142.0.0'
    };
    const getVersions = vi.fn(() => versions);
    const reportUnexpected = vi.fn();

    registerMainIpcBindings({
      removeHandler,
      installHandler: (channel, listener) => { installed.set(channel, listener); },
      resolveOwner,
      handlersFor,
      allowedOutputPaths,
      showItemInFolder,
      versions: getVersions,
      reportUnexpected
    });

    return {
      allowedOutputPaths,
      handlers,
      handlersFor,
      getVersions,
      installed,
      owner,
      removeHandler,
      reportUnexpected,
      resolveOwner,
      showItemInFolder,
      versions
    };
  };

  it('installs and safely executes every production invoke channel exactly once', async () => {
    const fixture = createFixture();
    const expected = [...SESSION_INVOKE_CHANNELS, IPC.openFolder, IPC.versions];
    expect(fixture.removeHandler.mock.calls.map(([channel]) => channel)).toEqual(Object.values(IPC));
    expect([...fixture.installed.keys()]).toEqual(expected);

    for (const channel of expected) {
      const args = channel === IPC.openFolder ? ['C:\\allowed\\package.zip'] : [];
      const result = await fixture.installed.get(channel)!({ sender: { id: 73 } }, ...args);
      expect(result).toMatchObject({ ok: true });
    }
  });

  it('resolves the exact sender owner and safely rejects an unavailable owner', async () => {
    const fixture = createFixture();
    const sender = { id: 73 };
    await expect(fixture.installed.get(IPC.newProject)!({ sender }, 'document_generation'))
      .resolves.toEqual(ipcSuccess({
        channel: IPC.newProject,
        senderId: 73,
        args: ['document_generation']
      }));
    expect(fixture.resolveOwner).toHaveBeenCalledWith(sender);
    expect(fixture.handlersFor).toHaveBeenCalledWith(fixture.owner);

    const callsBeforeMissingOwner = fixture.handlersFor.mock.calls.length;
    await expect(fixture.installed.get(IPC.openProject)!({ sender: { id: 99 } })).resolves.toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'WINDOW_UNAVAILABLE',
        presentation: GENERIC_USER_PRESENTATION
      }
    });
    expect(fixture.handlersFor).toHaveBeenCalledTimes(callsBeforeMissingOwner);
  });

  it('binds direct actions and sends their failures through the production safe runner', async () => {
    const fixture = createFixture();
    const event = { sender: { id: 73 } };

    await expect(fixture.installed.get(IPC.versions)!(event)).resolves.toEqual(
      ipcSuccess(fixture.versions)
    );
    await expect(
      fixture.installed.get(IPC.openFolder)!(event, 'C:\\allowed\\package.zip')
    ).resolves.toEqual(ipcSuccess(undefined));
    expect(fixture.showItemInFolder).toHaveBeenCalledWith('C:\\allowed\\package.zip');

    await expect(
      fixture.installed.get(IPC.openFolder)!(event, 'C:\\not-allowed\\package.zip')
    ).resolves.toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'OUTPUT_NOT_ALLOWED',
        presentation: userFacingErrors.outputNotAllowed
      }
    });

    const unexpected = new Error('shell implementation failed');
    fixture.showItemInFolder.mockImplementationOnce(() => { throw unexpected; });
    await expect(
      fixture.installed.get(IPC.openFolder)!(event, 'C:\\allowed\\package.zip')
    ).resolves.toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', presentation: GENERIC_USER_PRESENTATION }
    });
    expect(fixture.reportUnexpected).toHaveBeenCalledWith(unexpected);
  });

  it('rejects direct invokes from an unavailable owner before any direct action runs', async () => {
    const fixture = createFixture();
    const unavailableEvent = { sender: { id: 99 } };
    const unavailable = {
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'WINDOW_UNAVAILABLE',
        presentation: GENERIC_USER_PRESENTATION
      }
    };

    await expect(
      fixture.installed.get(IPC.openFolder)!(unavailableEvent, 'C:\\allowed\\package.zip')
    ).resolves.toEqual(unavailable);
    await expect(fixture.installed.get(IPC.versions)!(unavailableEvent)).resolves.toEqual(unavailable);

    expect(fixture.showItemInFolder).not.toHaveBeenCalled();
    expect(fixture.getVersions).not.toHaveBeenCalled();
    expect(fixture.resolveOwner).toHaveBeenNthCalledWith(1, unavailableEvent.sender);
    expect(fixture.resolveOwner).toHaveBeenNthCalledWith(2, unavailableEvent.sender);
  });
});
