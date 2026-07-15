import { describe, expect, it, vi } from 'vitest';
import { ProjectSessionManager, type SessionResources } from '../src/main/project-session.js';
import { DocumentRegistry } from '../src/main/document-registry.js';
import { UserFacingError } from '../src/shared/ipc-result.js';
import {
  exportCleanSession,
  guardUnsavedSession,
  replaceWithCandidate
} from '../src/main/session-workflows.js';

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

const readyManager = () => {
  const manager = new ProjectSessionManager(resources);
  const active = manager.createCandidate('document_generation');
  active.project.generation = {
    ...active.project.generation!,
    instructions: '本文を作成する'
  };
  manager.replaceCurrent(active);
  return manager;
};

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('session workflows', () => {
  it.each([
    ['discard', true],
    ['cancel', false]
  ] as const)('handles %s without saving', async (decision, expected) => {
    const manager = readyManager();
    const ports = {
      askUnsaved: vi.fn().mockResolvedValue(decision),
      pickProjectPath: vi.fn(),
      showError: vi.fn()
    };

    await expect(guardUnsavedSession(manager, ports)).resolves.toBe(expected);

    expect(ports.pickProjectPath).not.toHaveBeenCalled();
  });

  it('continues only after a successful save decision', async () => {
    const manager = readyManager();
    const ports = {
      askUnsaved: vi.fn().mockResolvedValue('save'),
      pickProjectPath: vi.fn().mockResolvedValue('C:\\work\\saved.clmproj'),
      showError: vi.fn()
    };

    await expect(guardUnsavedSession(manager, ports)).resolves.toBe(true);

    expect(manager.currentSummary().dirty).toBe(false);
  });

  it('does not replace the current context after cancel', async () => {
    const manager = readyManager();
    const beforeId = manager.currentSummary().project.projectId;
    const candidate = manager.createCandidate('existing_document');
    const ports = {
      askUnsaved: vi.fn().mockResolvedValue('cancel'),
      pickProjectPath: vi.fn(),
      showError: vi.fn()
    };

    const result = await replaceWithCandidate(manager, candidate, ports);

    expect(result.canceled).toBe(true);
    expect(manager.currentSummary().project.projectId).toBe(beforeId);
  });

  it('defensively refuses export while the authoritative session is dirty', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    const generate = vi.mocked(context.resources.packageGenerator.generate);
    const pickExportPath = vi.fn().mockResolvedValue('C:\\work\\package.zip');

    await expect(exportCleanSession(manager, { pickExportPath })).rejects.toMatchObject({
      code: 'PROJECT_DIRTY',
      message: 'プロジェクトを保存してからパッケージを作成してください。'
    });
    expect(pickExportPath).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  it('keeps the active context after save failure', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    const before = manager.currentSummary();
    const diskFailure = new Error('disk failure');
    vi.mocked(context.resources.store.saveProject).mockRejectedValue(diskFailure);
    const showError = vi.fn();
    const reportUnexpected = vi.fn();

    const continued = await guardUnsavedSession(manager, {
      askUnsaved: vi.fn().mockResolvedValue('save'),
      pickProjectPath: vi.fn().mockResolvedValue('C:\\work\\saved.clmproj'),
      showError,
      reportUnexpected
    });

    expect(continued).toBe(false);
    expect(manager.currentSummary()).toEqual(before);
    expect(manager.requireCurrent().resources.registry).toBe(context.resources.registry);
    expect(showError).toHaveBeenCalledWith(
      'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
    );
    expect(reportUnexpected).toHaveBeenCalledWith(diskFailure);
  });

  it('keeps the active context when the save-path picker is canceled', async () => {
    const manager = readyManager();
    const before = manager.currentSummary();

    const continued = await guardUnsavedSession(manager, {
      askUnsaved: vi.fn().mockResolvedValue('save'),
      pickProjectPath: vi.fn().mockResolvedValue(undefined),
      showError: vi.fn()
    });

    expect(continued).toBe(false);
    expect(manager.currentSummary()).toEqual(before);
  });

  it('keeps the active context and shows a safe validation message when guarded save is invalid', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    context.project.generation = { ...context.project.generation!, instructions: '' };
    const before = manager.currentSummary();
    const showError = vi.fn();

    const continued = await guardUnsavedSession(manager, {
      askUnsaved: vi.fn().mockResolvedValue('save'),
      pickProjectPath: vi.fn(),
      showError
    });

    expect(continued).toBe(false);
    expect(manager.currentSummary()).toEqual(before);
    expect(showError).toHaveBeenCalledWith('保存できません: 文書生成指示が空です。');
  });

  it('refuses replacement when a successful save still has a newer dirty revision', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    const candidate = manager.createCandidate('existing_document');
    const saveStarted = deferred();
    const releaseSave = deferred();
    vi.mocked(context.resources.store.saveProject).mockImplementation(async () => {
      saveStarted.resolve();
      await releaseSave.promise;
    });
    const showError = vi.fn();

    const replacing = replaceWithCandidate(manager, candidate, {
      askUnsaved: vi.fn().mockResolvedValue('save'),
      pickProjectPath: vi.fn().mockResolvedValue('C:\\work\\saved.clmproj'),
      showError
    });
    await saveStarted.promise;
    const projectDuringSave = manager.currentSummary().project;
    expect(manager.updateDraft({ ...projectDuringSave, name: '保存中の新しい入力' }, 1)).toBe(true);
    releaseSave.resolve();

    await expect(replacing).resolves.toEqual({ canceled: true });
    expect(manager.requireCurrent()).toBe(context);
    expect(manager.currentSummary()).toMatchObject({
      dirty: true,
      project: { name: '保存中の新しい入力' }
    });
    expect(showError).toHaveBeenCalledWith(
      '保存中に新しい変更があったため、操作を中止しました。もう一度実行してください。'
    );
  });

  it('blocks export before choosing a destination when validation fails', async () => {
    const manager = new ProjectSessionManager(resources);
    const invalid = manager.createCandidate('existing_document');
    invalid.dirty = false;
    manager.replaceCurrent(invalid);
    const context = manager.requireCurrent();
    const pickExportPath = vi.fn();

    await expect(exportCleanSession(manager, { pickExportPath })).rejects.toMatchObject({
      code: 'PROJECT_INVALID',
      message: 'パッケージを作成できません: 主対象文書がありません。'
    });
    expect(pickExportPath).not.toHaveBeenCalled();
    expect(context.resources.packageGenerator.generate).not.toHaveBeenCalled();
  });

  it('cancels export before generation without mutating the clean session', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    context.dirty = false;
    context.path = 'C:\\work\\saved.clmproj';
    const before = manager.currentSummary();

    await expect(exportCleanSession(manager, {
      pickExportPath: vi.fn().mockResolvedValue(undefined)
    })).resolves.toEqual({ canceled: true });

    expect(context.resources.packageGenerator.generate).not.toHaveBeenCalled();
    expect(manager.currentSummary()).toEqual(before);
  });

  it('exports a valid clean session without mutating its snapshot', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    context.dirty = false;
    context.path = 'C:\\work\\saved.clmproj';
    const before = manager.currentSummary();

    const result = await exportCleanSession(manager, {
      pickExportPath: vi.fn().mockResolvedValue('C:\\work\\package.zip')
    });

    expect(context.resources.packageGenerator.generate).toHaveBeenCalledWith(
      'C:\\work\\package.zip',
      before.project
    );
    expect(result).toMatchObject({
      canceled: false,
      path: 'C:\\work\\package.zip',
      packageId: 'PKG-1',
      fileCount: 5
    });
    expect(manager.currentSummary()).toEqual(before);
  });

  it('wraps package failures without leaking the raw error through the message', async () => {
    const manager = readyManager();
    const context = manager.requireCurrent();
    context.dirty = false;
    const rawFailure = new Error('C:\\private\\package.zip: access denied');
    vi.mocked(context.resources.packageGenerator.generate).mockRejectedValue(rawFailure);
    const before = manager.currentSummary();

    const failure = await exportCleanSession(manager, {
      pickExportPath: vi.fn().mockResolvedValue('C:\\work\\package.zip')
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(UserFacingError);
    expect(failure).toMatchObject({
      code: 'PACKAGE_EXPORT_FAILED',
      message: 'パッケージを作成できませんでした。保存先とアクセス権を確認してください。',
      cause: rawFailure
    });
    expect((failure as Error).message).not.toContain('C:\\private');
    expect(manager.currentSummary()).toEqual(before);
  });

  it('allows the first project creation without an unsaved prompt', async () => {
    const manager = new ProjectSessionManager(resources);
    const askUnsaved = vi.fn();

    const result = await replaceWithCandidate(
      manager,
      manager.createCandidate('document_generation'),
      {
        askUnsaved,
        pickProjectPath: vi.fn(),
        showError: vi.fn()
      }
    );

    expect(result.canceled).toBe(false);
    expect(askUnsaved).not.toHaveBeenCalled();
  });

  it('replaces an existing clean project without an unsaved prompt', async () => {
    const manager = readyManager();
    manager.requireCurrent().dirty = false;
    const askUnsaved = vi.fn();

    const result = await replaceWithCandidate(
      manager,
      manager.createCandidate('existing_document'),
      {
        askUnsaved,
        pickProjectPath: vi.fn(),
        showError: vi.fn()
      }
    );

    expect(result.canceled).toBe(false);
    expect(result.summary?.project.mode).toBe('existing_document');
    expect(askUnsaved).not.toHaveBeenCalled();
  });
});
