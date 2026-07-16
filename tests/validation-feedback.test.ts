import { describe, expect, it, vi } from 'vitest';
import { DocumentRegistry } from '../src/main/document-registry.js';
import {
  ProjectSessionManager,
  type SessionResources
} from '../src/main/project-session.js';
import { createBridge } from '../src/preload/preload.js';
import { safeRendererError } from '../src/renderer/session-orchestrator.js';
import { runIpcOperation } from '../src/shared/ipc-result.js';
import { validationMessages } from '../src/shared/presentation/ja/index.js';

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
  it('carries empty generation instructions safely from Main validation to the Renderer presentation', async () => {
    const manager = new ProjectSessionManager(resources);
    manager.replaceCurrent(manager.createCandidate('document_generation'));

    const envelope = await runIpcOperation(() => manager.saveCurrent(false, vi.fn()));
    expect(envelope).toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'PROJECT_INVALID',
        presentation: {
          title: validationMessages.GENERATION_INSTRUCTIONS_REQUIRED.title,
          message: validationMessages.GENERATION_INSTRUCTIONS_REQUIRED.remediation,
          nextAction: '入力内容を修正してから、もう一度操作してください。'
        }
      }
    });

    const bridge = createBridge({
      invoke: vi.fn().mockResolvedValue(envelope),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    const transported = await bridge.saveProject().catch((error: unknown) => error);
    const safe = safeRendererError(structuredClone(transported));

    expect(safe.code).toBe('PROJECT_INVALID');
    expect(safe.presentation.title).toBe('文書生成指示が入力されていません。');
    expect(safe.presentation.message).toBe('生成する文書に含める内容、構成、文体、注意事項を入力してください。');
    expect(JSON.stringify(safe)).not.toMatch(/project:save|C:\\| at /);
  });
});
