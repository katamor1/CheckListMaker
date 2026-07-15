import { describe, expect, it, vi } from 'vitest';
import { DocumentRegistry } from '../src/main/document-registry.js';
import {
  ProjectSessionManager,
  type SessionResources
} from '../src/main/project-session.js';
import { createBridge } from '../src/preload/preload.js';
import {
  normalizeRendererError,
  safeRendererErrorMessage
} from '../src/renderer/session-orchestrator.js';
import { runIpcOperation } from '../src/shared/ipc-result.js';

const resources = (): SessionResources => ({
  registry: new DocumentRegistry(),
  store: {
    openProject: vi.fn(),
    saveProject: vi.fn(),
    saveTemplate: vi.fn(),
    openTemplate: vi.fn()
  },
  packageGenerator: { generate: vi.fn() }
});

describe('fixed validation feedback contract', () => {
  it('carries empty generation instructions safely from Main validation to the Renderer message', async () => {
    const manager = new ProjectSessionManager(resources);
    manager.replaceCurrent(manager.createCandidate('document_generation'));

    const envelope = await runIpcOperation(() => manager.saveCurrent(false, vi.fn()));
    expect(envelope).toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'PROJECT_INVALID',
        message: '保存できません: 文書生成指示が空です。'
      }
    });

    const bridge = createBridge({
      invoke: vi.fn().mockResolvedValue(envelope),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    const transported = await bridge.saveProject().catch((error: unknown) => error);
    const message = safeRendererErrorMessage(normalizeRendererError(structuredClone(transported)));

    expect(message).toBe('保存できません: 文書生成指示が空です。');
    expect(message).not.toMatch(/project:save|C:\\| at /);
  });
});
