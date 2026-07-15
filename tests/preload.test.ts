import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../src/shared/ipc.js';
import { createBridge, PRELOAD_IPC } from '../src/preload/preload.js';
import { ipcSuccess } from '../src/shared/ipc-result.js';

describe('Preload bridge', () => {
  it('sends revisioned drafts and unwraps typed results', async () => {
    const invoke = vi.fn().mockResolvedValue(ipcSuccess({ accepted: true, revision: 4 }));
    const on = vi.fn();
    const removeListener = vi.fn();
    const bridge = createBridge({ invoke, on, removeListener });
    const project = { projectId: 'P-1' } as never;

    await expect(bridge.updateProject(project, 4)).resolves.toEqual({ accepted: true, revision: 4 });
    expect(PRELOAD_IPC.updateProject).toBe(IPC.updateProject);
    expect(invoke).toHaveBeenCalledWith(PRELOAD_IPC.updateProject, project, 4);
  });

  it('subscribes and unsubscribes the close flush event', () => {
    const invoke = vi.fn();
    const on = vi.fn();
    const removeListener = vi.fn();
    const bridge = createBridge({ invoke, on, removeListener });
    const listener = vi.fn();
    const unsubscribe = bridge.onFlushBeforeClose(listener);
    const registered = on.mock.calls[0]?.[1];

    registered({}, 'REQ-1');
    expect(listener).toHaveBeenCalledWith('REQ-1');
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(PRELOAD_IPC.flushBeforeClose, registered);
  });

  it('hides an Electron transport rejection', async () => {
    const invoke = vi.fn().mockRejectedValue(
      new Error("Error invoking remote method 'project:save': Error: internal detail")
    );
    const bridge = createBridge({ invoke, on: vi.fn(), removeListener: vi.fn() });
    await expect(bridge.saveProject()).rejects.toThrow('処理に失敗しました。再度お試しください。');
    await expect(bridge.saveProject()).rejects.not.toThrow('project:save');
  });

  it('keeps every duplicated preload channel equal to the shared contract', () => {
    expect(PRELOAD_IPC).toEqual(IPC);
  });

  it('shows only a typed user message and genericizes a malformed envelope', async () => {
    const userFailure = createBridge({
      invoke: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'PROJECT_INVALID', message: '保存できません: 入力を確認してください。' }
      }),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    await expect(userFailure.saveProject()).rejects.toThrow('保存できません: 入力を確認してください。');

    const malformed = createBridge({
      invoke: vi.fn().mockResolvedValue(null),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    await expect(malformed.saveProject()).rejects.toThrow('処理に失敗しました。再度お試しください。');
  });

  it('subscribes to close cancellation with the matching request id', () => {
    const on = vi.fn();
    const removeListener = vi.fn();
    const bridge = createBridge({ invoke: vi.fn(), on, removeListener });
    const listener = vi.fn();
    const unsubscribe = bridge.onCloseCanceled(listener);
    const registered = on.mock.calls[0]?.[1];
    registered({}, 'REQ-2');
    expect(listener).toHaveBeenCalledWith('REQ-2');
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(PRELOAD_IPC.closeCanceled, registered);
  });
});
