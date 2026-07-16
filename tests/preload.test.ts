import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../src/shared/ipc.js';
import {
  PRELOAD_IPC,
  PRELOAD_RENDERER_ERROR_BRAND,
  PRELOAD_USER_ERROR_BRAND,
  createBridge
} from '../src/preload/preload.js';
import {
  GENERIC_USER_PRESENTATION,
  IPC_USER_ERROR_BRAND,
  ipcSuccess
} from '../src/shared/ipc-result.js';
import { userFacingErrors } from '../src/shared/presentation/ja/index.js';
import {
  normalizeRendererError,
  safeRendererError
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

  it('hides an Electron transport rejection behind the generic structured presentation', async () => {
    const invoke = vi.fn().mockRejectedValue(
      new Error("Error invoking remote method 'project:save': Error: internal detail")
    );
    const bridge = createBridge({ invoke, on: vi.fn(), removeListener: vi.fn() });
    const rejected = await bridge.saveProject().catch((error: unknown) => error);
    expect(safeRendererError(rejected)).toEqual({
      code: 'INTERNAL_ERROR',
      presentation: GENERIC_USER_PRESENTATION
    });
    expect(JSON.stringify(rejected)).not.toContain('project:save');
  });

  it('keeps duplicated preload channels and brands equal to the shared contract', () => {
    expect(PRELOAD_IPC).toEqual(IPC);
    expect(PRELOAD_USER_ERROR_BRAND).toBe(IPC_USER_ERROR_BRAND);
    expect(PRELOAD_RENDERER_ERROR_BRAND).toBe('checklistmaker.renderer-user-error.v1');
  });

  it('transfers only a branded structured presentation into a Renderer-safe value', async () => {
    const userFailure = createBridge({
      invoke: vi.fn().mockResolvedValue({
        ok: false,
        error: {
          brand: 'checklistmaker.user-facing-error.v1',
          code: 'PROJECT_SAVE_FAILED',
          presentation: userFacingErrors.projectSaveFailed
        }
      }),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    const trusted = await userFailure.saveProject().catch((error: unknown) => error);
    expect(trusted).toEqual({
      brand: 'checklistmaker.renderer-user-error.v1',
      code: 'PROJECT_SAVE_FAILED',
      presentation: userFacingErrors.projectSaveFailed
    });
    const transported = structuredClone(trusted);
    expect(normalizeRendererError(transported)).toEqual({
      code: 'PROJECT_SAVE_FAILED',
      presentation: userFacingErrors.projectSaveFailed
    });
    expect(safeRendererError(transported)).toEqual({
      code: 'PROJECT_SAVE_FAILED',
      presentation: userFacingErrors.projectSaveFailed
    });
  });

  it('genericizes unbranded, mismatched, malformed, and oversized failure envelopes', async () => {
    const failures = [
      {
        ok: false,
        error: {
          code: 'PROJECT_SAVE_FAILED',
          presentation: userFacingErrors.projectSaveFailed
        }
      },
      {
        ok: false,
        error: {
          brand: 'checklistmaker.user-facing-error.v1',
          code: 'PROJECT_SAVE_FAILED',
          presentation: { title: '秘密', message: 'Cannot read properties of undefined', extra: true }
        }
      },
      {
        ok: false,
        error: {
          brand: 'checklistmaker.user-facing-error.v1',
          code: 'PROJECT_SAVE_FAILED',
          presentation: { title: 'a'.repeat(2_001), message: 'message' }
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
      expect(safeRendererError(error)).toEqual({
        code: 'INTERNAL_ERROR',
        presentation: GENERIC_USER_PRESENTATION
      });
    }
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
