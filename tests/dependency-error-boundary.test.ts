import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import { IPC } from '../src/shared/ipc.js';
import { UserFacingError } from '../src/shared/ipc-result.js';
import { userFacingErrors } from '../src/shared/presentation/ja/index.js';
import { DocumentRegistry } from '../src/main/document-registry.js';
import {
  createSessionHandlers,
  type SessionHandlerDependencies
} from '../src/main/session-handlers.js';

const context = { senderId: 41 };

const createDependencies = (
  dependencyError: UserFacingError
): SessionHandlerDependencies => {
  const registry = new DocumentRegistry();
  const active = {
    project: createProject('existing_document'),
    dirty: true,
    revision: 0,
    resources: {
      registry,
      store: {
        openProject: vi.fn(),
        saveProject: vi.fn(),
        saveTemplate: vi.fn(),
        openTemplate: vi.fn()
      },
      packageGenerator: { generate: vi.fn() }
    }
  };

  return {
    manager: {
      runExclusive: async <T>(operation: () => T): Promise<Awaited<T>> =>
        Promise.resolve(operation()) as Promise<Awaited<T>>,
      requireCurrent: () => active,
      applyMainUpdate: vi.fn(),
      currentTemplate: vi.fn(),
      setCurrentTemplate: vi.fn()
    },
    controllerFor: vi.fn(() => {
      throw new Error('controller is not used by this test');
    }),
    selectTarget: vi.fn().mockRejectedValue(dependencyError),
    selectReferences: vi.fn(),
    pickTemplateSavePath: vi.fn(),
    pickTemplateOpenPath: vi.fn(),
    acknowledgeClose: vi.fn(),
    measureOutput: vi.fn(),
    allowedOutputPaths: new Set<string>()
  };
};

describe('dependency error boundary', () => {
  it('replaces even a known-code dependency error with the operation-approved presentation', async () => {
    const dependencyError = new UserFacingError('PROJECT_SAVE_FAILED', {
      title: 'C:\\secret\\customer.docx',
      message: 'raw dependency message\n    at project:save',
      nextAction: 'unsafe internal action'
    });
    const handlers = createSessionHandlers(createDependencies(dependencyError));

    await expect(handlers[IPC.selectTarget](context)).rejects.toMatchObject({
      code: 'DOCUMENT_REGISTER_FAILED',
      presentation: userFacingErrors.targetRegisterFailed,
      cause: dependencyError
    });
  });
});
