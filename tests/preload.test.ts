import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../src/shared/ipc.js';
import {
  PRELOAD_IPC,
  PRELOAD_RENDERER_ERROR_BRAND,
  PRELOAD_SAFE_USER_MESSAGES,
  PRELOAD_USER_ERROR_BRAND,
  createBridge
} from '../src/preload/preload.js';
import {
  IPC_USER_ERROR_BRAND,
  SAFE_USER_MESSAGES,
  ipcSuccess
} from '../src/shared/ipc-result.js';
import {
  normalizeRendererError,
  safeRendererErrorMessage
} from '../src/renderer/session-orchestrator.js';

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
    expect(PRELOAD_USER_ERROR_BRAND).toBe(IPC_USER_ERROR_BRAND);
    expect(PRELOAD_RENDERER_ERROR_BRAND).toBe('checklistmaker.renderer-user-error.v1');
    expect(PRELOAD_SAFE_USER_MESSAGES).toEqual(SAFE_USER_MESSAGES);
  });

  it('transfers only a branded, allowlisted user message into a Renderer-safe Error', async () => {
    const userFailure = createBridge({
      invoke: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          brand: 'checklistmaker.user-facing-error.v1',
          code: 'PROJECT_SAVE_FAILED',
          message: 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
        }
      }),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    const trusted = await userFailure.saveProject().catch((error: unknown) => error);
    expect(trusted).toEqual({
      brand: 'checklistmaker.renderer-user-error.v1',
      code: 'PROJECT_SAVE_FAILED',
      message: 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
    });
    const transported = structuredClone(trusted);
    expect(safeRendererErrorMessage(transported)).toBe('処理に失敗しました。再度お試しください。');
    const normalized = normalizeRendererError(transported);
    expect(normalized).toBeInstanceOf(Error);
    expect((normalized as Error).name).toBe('CheckListMakerUserFacingError:PROJECT_SAVE_FAILED');
    expect(safeRendererErrorMessage(normalized)).toBe(
      'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
    );
  });

  it('genericizes unbranded, mismatched, and malformed failure envelopes', async () => {
    const failures = [
      {
        ok: false,
        error: {
          code: 'PROJECT_SAVE_FAILED',
          message: 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
        }
      },
      {
        ok: false,
        error: {
          brand: 'checklistmaker.user-facing-error.v1',
          code: 'PROJECT_SAVE_FAILED',
          message: 'Cannot read properties of undefined'
        }
      },
      null
    ];

    for (const failure of failures) {
      const bridge = createBridge({
        invoke: vi.fn().mockResolvedValue(failure),
        on: vi.fn(),
        removeListener: vi.fn()
      });
      const error = await bridge.saveProject().catch((reason: unknown) => reason);
      expect(safeRendererErrorMessage(normalizeRendererError(error)))
        .toBe('処理に失敗しました。再度お試しください。');
    }

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
