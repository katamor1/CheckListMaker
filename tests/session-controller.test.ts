import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import { GENERIC_USER_MESSAGE, runIpcOperation } from '../src/shared/ipc-result.js';
import type { ProjectDefinition } from '../src/shared/model.js';
import { DocumentRegistry } from '../src/main/document-registry.js';
import {
  ProjectSessionManager,
  type SessionResources,
  type SessionResourcesFactory
} from '../src/main/project-session.js';
import {
  ProjectSessionController,
  type SessionControllerPorts
} from '../src/main/session-controller.js';

const resources = (): SessionResources => ({
  registry: new DocumentRegistry(),
  store: {
    openProject: vi.fn(),
    saveProject: vi.fn().mockResolvedValue(undefined),
    saveTemplate: vi.fn(),
    openTemplate: vi.fn()
  },
  packageGenerator: {
    generate: vi.fn().mockResolvedValue({ packageId: 'PKG-1', fileCount: 5 })
  }
});

const validGenerationProject = (): ProjectDefinition => {
  const project = createProject('document_generation');
  project.generation = {
    ...project.generation!,
    instructions: '本文を作成する'
  };
  return project;
};

const readyManager = (
  createResources: SessionResourcesFactory = resources
): ProjectSessionManager => {
  const manager = new ProjectSessionManager(createResources);
  const active = manager.createCandidate('document_generation');
  active.project.generation = {
    ...active.project.generation!,
    instructions: '本文を作成する'
  };
  manager.replaceCurrent(active);
  return manager;
};

const ports = (
  overrides: Partial<SessionControllerPorts> = {}
): SessionControllerPorts => ({
  askUnsaved: vi.fn().mockResolvedValue('cancel'),
  pickProjectPath: vi.fn().mockResolvedValue(undefined),
  showError: vi.fn(),
  pickExportPath: vi.fn().mockResolvedValue(undefined),
  pickOpenProject: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const selectedDocument = (registry: DocumentRegistry, text: string) => {
  const bytes = Buffer.from(text);
  return {
    bytes,
    document: registry.registerBytes(
      {
        originalFileName: 'target.md',
        storedPath: 'documents/target.md',
        mediaType: 'text/markdown',
        sizeBytes: bytes.byteLength,
        sha256: 'a'.repeat(64),
        format: 'md',
        editable: true
      },
      bytes
    )
  };
};

describe('ProjectSessionController', () => {
  it('creates the first project without an unsaved prompt', async () => {
    const manager = new ProjectSessionManager(resources);
    const controllerPorts = ports();
    const controller = new ProjectSessionController(manager, controllerPorts);

    const result = await controller.newProject('document_generation');

    expect(result).toMatchObject({
      canceled: false,
      summary: { dirty: true, revision: 0, project: { mode: 'document_generation' } }
    });
    expect(controllerPorts.askUnsaved).not.toHaveBeenCalled();
  });

  it.each([
    ['new', 'save'],
    ['new', 'discard'],
    ['new', 'cancel'],
    ['open', 'save'],
    ['open', 'discard'],
    ['open', 'cancel']
  ] as const)(
    'uses the common %s-project guard for the %s decision',
    async (operation, decision) => {
      const activeResources = resources();
      const candidateResources = resources();
      vi.mocked(candidateResources.store.openProject).mockResolvedValue(
        createProject('existing_document')
      );
      const createResources = vi.fn()
        .mockReturnValueOnce(activeResources)
        .mockReturnValueOnce(candidateResources);
      const manager = readyManager(createResources);
      const active = manager.requireCurrent();
      const before = manager.currentSummary();
      const controllerPorts = ports({
        askUnsaved: vi.fn().mockResolvedValue(decision),
        pickProjectPath: vi.fn().mockResolvedValue('C:\\work\\active.clmproj'),
        pickOpenProject: vi.fn().mockResolvedValue('C:\\work\\candidate.clmproj')
      });
      const controller = new ProjectSessionController(manager, controllerPorts);

      const result = operation === 'new'
        ? await controller.newProject('existing_document')
        : await controller.openProject();

      expect(controllerPorts.askUnsaved).toHaveBeenCalledOnce();
      expect(controllerPorts.askUnsaved).toHaveBeenCalledWith(before.project.name);
      if (decision === 'cancel') {
        expect(result).toEqual({ canceled: true });
        expect(manager.requireCurrent()).toBe(active);
        expect(manager.currentSummary()).toEqual(before);
      } else {
        expect(result).toMatchObject({
          canceled: false,
          summary: { project: { mode: 'existing_document' } }
        });
        expect(manager.requireCurrent()).not.toBe(active);
      }
      if (decision === 'save') {
        expect(activeResources.store.saveProject).toHaveBeenCalledOnce();
      } else {
        expect(activeResources.store.saveProject).not.toHaveBeenCalled();
      }
      if (operation === 'open') {
        expect(candidateResources.store.openProject).toHaveBeenCalledWith(
          'C:\\work\\candidate.clmproj'
        );
      } else {
        expect(controllerPorts.pickOpenProject).not.toHaveBeenCalled();
      }
    }
  );

  it('fully loads an open candidate before asking and cancel keeps the exact active context', async () => {
    const activeResources = resources();
    const candidateResources = resources();
    const loadStarted = deferred();
    const releaseLoad = deferred();
    const events: string[] = [];
    vi.mocked(candidateResources.store.openProject).mockImplementation(async () => {
      events.push('candidate:load:start');
      loadStarted.resolve();
      await releaseLoad.promise;
      events.push('candidate:load:complete');
      return createProject('existing_document');
    });
    const createResources = vi.fn()
      .mockReturnValueOnce(activeResources)
      .mockReturnValueOnce(candidateResources);
    const manager = readyManager(createResources);
    const active = manager.requireCurrent();
    active.path = 'C:\\work\\active.clmproj';
    const before = manager.currentSummary();
    const askUnsaved = vi.fn(async () => {
      events.push('unsaved:ask');
      return 'cancel' as const;
    });
    const controller = new ProjectSessionController(manager, ports({
      askUnsaved,
      pickOpenProject: vi.fn().mockResolvedValue('C:\\work\\candidate.clmproj')
    }));

    const opening = controller.openProject();
    await loadStarted.promise;

    expect(events).toEqual(['candidate:load:start']);
    expect(askUnsaved).not.toHaveBeenCalled();
    releaseLoad.resolve();

    await expect(opening).resolves.toEqual({ canceled: true });
    expect(events).toEqual([
      'candidate:load:start',
      'candidate:load:complete',
      'unsaved:ask'
    ]);
    expect(manager.requireCurrent()).toBe(active);
    expect(manager.requireCurrent().resources).toBe(activeResources);
    expect(manager.currentSummary()).toEqual(before);
  });

  it('isolates a rejected open candidate and keeps the old save and export resources usable', async () => {
    const activeResources = resources();
    const candidateResources = resources();
    const activeSelection = selectedDocument(activeResources.registry, 'active document');
    const rawFailure = new Error('C:\\private\\broken.clmproj: malformed archive');
    let candidateToken = '';
    vi.mocked(candidateResources.store.openProject).mockImplementation(async () => {
      candidateToken = selectedDocument(candidateResources.registry, 'candidate document').document.token;
      throw rawFailure;
    });
    const createResources = vi.fn()
      .mockReturnValueOnce(activeResources)
      .mockReturnValueOnce(candidateResources);
    const manager = new ProjectSessionManager(createResources);
    const active = manager.createCandidate('existing_document');
    active.project.target = activeSelection.document;
    active.path = 'C:\\work\\active.clmproj';
    manager.replaceCurrent(active);
    const before = manager.currentSummary();
    const reportUnexpected = vi.fn();
    const controllerPorts = ports({
      pickOpenProject: vi.fn().mockResolvedValue('C:\\private\\broken.clmproj'),
      pickExportPath: vi.fn().mockResolvedValue('C:\\work\\package.zip')
    });
    const controller = new ProjectSessionController(manager, controllerPorts);

    const openResult = await runIpcOperation(() => controller.openProject(), reportUnexpected);

    expect(openResult).toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'PROJECT_OPEN_FAILED',
        message: 'プロジェクトを開けませんでした。ファイルが破損しているか、対応していない形式です。'
      }
    });
    expect(JSON.stringify(openResult)).not.toContain('C:\\private');
    expect(reportUnexpected).toHaveBeenCalledWith(rawFailure);
    expect(manager.requireCurrent()).toBe(active);
    expect(manager.currentSummary()).toEqual(before);
    expect(Buffer.from(await activeResources.registry.resolve(activeSelection.document.token)))
      .toEqual(activeSelection.bytes);
    expect(activeResources.registry.has(candidateToken)).toBe(false);
    expect(candidateResources.registry.has(candidateToken)).toBe(true);
    expect(controllerPorts.askUnsaved).not.toHaveBeenCalled();

    const saved = await controller.save(false);
    expect(saved.summary.dirty).toBe(false);
    expect(activeResources.store.saveProject).toHaveBeenCalledOnce();
    const exported = await controller.export();
    expect(exported).toMatchObject({ canceled: false, packageId: 'PKG-1', fileCount: 5 });
    expect(activeResources.packageGenerator.generate).toHaveBeenCalledOnce();
    expect(candidateResources.packageGenerator.generate).not.toHaveBeenCalled();
  });

  it('keeps the active context and recovers the queue after candidate creation fails', async () => {
    const activeResources = resources();
    const rawFailure = new Error('candidate resource initialization failed at C:\\private');
    let factoryCalls = 0;
    const createResources = vi.fn(() => {
      factoryCalls += 1;
      if (factoryCalls === 1) return activeResources;
      throw rawFailure;
    });
    const manager = readyManager(createResources);
    const active = manager.requireCurrent();
    active.path = 'C:\\work\\active.clmproj';
    const before = manager.currentSummary();
    const reportUnexpected = vi.fn();
    const controllerPorts = ports();
    const controller = new ProjectSessionController(manager, controllerPorts);

    const creationResult = await runIpcOperation(
      () => controller.newProject('existing_document'),
      reportUnexpected
    );

    expect(creationResult).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: GENERIC_USER_MESSAGE }
    });
    expect(JSON.stringify(creationResult)).not.toContain('C:\\private');
    expect(reportUnexpected).toHaveBeenCalledWith(rawFailure);
    expect(controllerPorts.askUnsaved).not.toHaveBeenCalled();
    expect(manager.requireCurrent()).toBe(active);
    expect(manager.requireCurrent().resources).toBe(activeResources);
    expect(manager.currentSummary()).toEqual(before);

    await expect(controller.save(false)).resolves.toMatchObject({ canceled: false });
    expect(activeResources.store.saveProject).toHaveBeenCalledOnce();
  });

  it('rejects a malformed draft without mutating the manager', async () => {
    const manager = readyManager();
    const before = manager.currentSummary();
    const controller = new ProjectSessionController(manager, ports());

    await expect(controller.updateDraft(null, 1)).rejects.toMatchObject({
      code: 'PROJECT_INVALID',
      message: 'プロジェクトデータが不正です。'
    });

    expect(manager.currentSummary()).toEqual(before);
  });

  it('rejects a stale draft without mutating the manager', async () => {
    const manager = readyManager();
    const before = manager.currentSummary();
    const controller = new ProjectSessionController(manager, ports());

    await expect(controller.updateDraft(before.project, before.revision)).resolves.toEqual({
      accepted: false,
      revision: before.revision
    });

    expect(manager.currentSummary()).toEqual(before);
  });

  it('rejects a cross-project draft without mutating the manager', async () => {
    const manager = readyManager();
    const before = manager.currentSummary();
    const controller = new ProjectSessionController(manager, ports());

    await expect(controller.updateDraft(validGenerationProject(), 1)).resolves.toEqual({
      accepted: false,
      revision: before.revision
    });

    expect(manager.currentSummary()).toEqual(before);
  });

  it('rejects an empty live token as malformed without mutating the manager', async () => {
    const manager = readyManager();
    const before = manager.currentSummary();
    const controller = new ProjectSessionController(manager, ports());
    const emptyTokenDocument = {
      token: '',
      originalFileName: 'target.md',
      storedPath: 'documents/target.md',
      mediaType: 'text/markdown',
      sizeBytes: 4,
      sha256: 'a'.repeat(64),
      format: 'md' as const,
      editable: true
    };

    await expect(controller.updateDraft({
      ...before.project,
      target: emptyTokenDocument
    }, 1)).rejects.toMatchObject({
      code: 'PROJECT_INVALID',
      message: 'プロジェクトデータが不正です。'
    });

    expect(manager.currentSummary()).toEqual(before);
  });

  it('rejects a token unknown to the active registry without mutating the manager', async () => {
    const manager = readyManager();
    const before = manager.currentSummary();
    const controller = new ProjectSessionController(manager, ports());
    const unknownDocument = {
      token: 'UNKNOWN-TOKEN',
      originalFileName: 'target.md',
      storedPath: 'documents/target.md',
      mediaType: 'text/markdown',
      sizeBytes: 4,
      sha256: 'a'.repeat(64),
      format: 'md' as const,
      editable: true
    };

    await expect(controller.updateDraft({
      ...before.project,
      target: unknownDocument
    }, 1)).rejects.toMatchObject({
      code: 'PROJECT_DOCUMENT_MISMATCH',
      message: '選択文書が現在のプロジェクトと一致しません。文書を選択し直してください。'
    });

    expect(manager.currentSummary()).toEqual(before);
  });

  it('completes a queued draft update before a following save reads the project', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    const before = manager.currentSummary();
    const blockerStarted = deferred();
    const releaseBlocker = deferred();
    const controller = new ProjectSessionController(manager, ports({
      pickProjectPath: vi.fn().mockResolvedValue('C:\\work\\queued.clmproj')
    }));
    const blocker = manager.runExclusive(async () => {
      blockerStarted.resolve();
      await releaseBlocker.promise;
    });
    await blockerStarted.promise;

    const updatedProject = { ...before.project, name: '保存される最新ドラフト' };
    const updating = controller.updateDraft(updatedProject, 1);
    const saving = controller.save(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(context.resources.store.saveProject).not.toHaveBeenCalled();

    releaseBlocker.resolve();
    await blocker;

    await expect(updating).resolves.toEqual({ accepted: true, revision: 1 });
    const saveResult = await saving;
    expect(saveResult.summary).toMatchObject({
      dirty: false,
      revision: 2,
      project: { name: '保存される最新ドラフト' }
    });
    expect(context.resources.store.saveProject).toHaveBeenCalledWith(
      'C:\\work\\queued.clmproj',
      expect.objectContaining({ name: '保存される最新ドラフト' })
    );
  });

  it('rejects dirty export before the ZIP picker or generator', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    const controllerPorts = ports({
      pickExportPath: vi.fn().mockResolvedValue('C:\\work\\package.zip')
    });
    const controller = new ProjectSessionController(manager, controllerPorts);

    await expect(controller.export()).rejects.toMatchObject({
      code: 'PROJECT_DIRTY',
      message: 'プロジェクトを保存してからパッケージを作成してください。'
    });
    expect(controllerPorts.pickExportPath).not.toHaveBeenCalled();
    expect(context.resources.packageGenerator.generate).not.toHaveBeenCalled();
  });

  it('does not reach the ZIP picker when a queued project save is canceled', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    const before = manager.currentSummary();
    const controllerPorts = ports({
      pickProjectPath: vi.fn().mockResolvedValue(undefined),
      pickExportPath: vi.fn().mockResolvedValue('C:\\work\\package.zip')
    });
    const controller = new ProjectSessionController(manager, controllerPorts);

    const saving = controller.save(false);
    const exporting = controller.export();
    const exportFailure = expect(exporting).rejects.toMatchObject({ code: 'PROJECT_DIRTY' });

    await expect(saving).resolves.toEqual({ canceled: true, summary: before });
    await exportFailure;
    expect(manager.currentSummary()).toEqual(before);
    expect(controllerPorts.pickExportPath).not.toHaveBeenCalled();
    expect(context.resources.packageGenerator.generate).not.toHaveBeenCalled();
  });

  it('keeps only the project clean when a queued ZIP destination is canceled after save', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    const controllerPorts = ports({
      pickProjectPath: vi.fn().mockResolvedValue('C:\\work\\saved.clmproj'),
      pickExportPath: vi.fn().mockResolvedValue(undefined)
    });
    const controller = new ProjectSessionController(manager, controllerPorts);

    const saving = controller.save(false);
    const exporting = controller.export();
    const [saveResult, exportResult] = await Promise.all([saving, exporting]);

    expect(saveResult).toMatchObject({ canceled: false, path: 'C:\\work\\saved.clmproj' });
    expect(saveResult.summary.dirty).toBe(false);
    expect(exportResult).toEqual({ canceled: true });
    expect(manager.currentSummary()).toEqual(saveResult.summary);
    expect(controllerPorts.pickExportPath).toHaveBeenCalledOnce();
    expect(context.resources.packageGenerator.generate).not.toHaveBeenCalled();
  });

  it('generates only from a valid clean project without mutating its snapshot', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    context.dirty = false;
    context.path = 'C:\\work\\saved.clmproj';
    const before = manager.currentSummary();
    const controller = new ProjectSessionController(manager, ports({
      pickExportPath: vi.fn().mockResolvedValue('C:\\work\\package.zip')
    }));

    const result = await controller.export();

    expect(result).toMatchObject({
      canceled: false,
      path: 'C:\\work\\package.zip',
      packageId: 'PKG-1',
      fileCount: 5
    });
    expect(context.resources.packageGenerator.generate).toHaveBeenCalledWith(
      'C:\\work\\package.zip',
      before.project
    );
    expect(manager.currentSummary()).toEqual(before);
  });
});
