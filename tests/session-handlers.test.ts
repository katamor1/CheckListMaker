import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import { IPC } from '../src/shared/ipc.js';
import { runIpcOperation, UserFacingError } from '../src/shared/ipc-result.js';
import { createBridge } from '../src/preload/preload.js';
import type {
  ChecklistTemplateDefinition,
  ExportResult,
  SelectedDocument,
  SessionSnapshot
} from '../src/shared/model.js';
import {
  createSessionHandlers,
  SESSION_INVOKE_CHANNELS,
  type SessionHandlerDependencies
} from '../src/main/session-handlers.js';

const context = { senderId: 41 };

const project = createProject('document_generation');
const snapshot: SessionSnapshot = { project, dirty: true, revision: 3 };
const selectedDocument: SelectedDocument = {
  token: 'DOC-1',
  originalFileName: 'source.md',
  storedPath: 'target/TARGET.md',
  mediaType: 'text/markdown',
  sizeBytes: 12,
  sha256: 'a'.repeat(64),
  format: 'md',
  editable: true
};
const template: ChecklistTemplateDefinition = {
  formatVersion: '1.0',
  templateId: 'T-1',
  revision: 1,
  name: 'template',
  defaultRepairPolicy: 'suggest_only',
  checklist: project.checklist,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
  contentSha256: 'b'.repeat(64)
};

const createFixture = () => {
  const registry = { name: 'active registry' };
  const store = {
    openProject: vi.fn(),
    saveProject: vi.fn(),
    saveTemplate: vi.fn().mockResolvedValue(template),
    openTemplate: vi.fn().mockResolvedValue(template)
  };
  const active = {
    project,
    dirty: true,
    revision: 3,
    resources: { registry, store, packageGenerator: { generate: vi.fn() } }
  };
  const manager = {
    runExclusive: vi.fn(async (operation: () => unknown) => operation()),
    requireCurrent: vi.fn(() => active),
    applyMainUpdate: vi.fn((update: (value: typeof project) => typeof project) => ({
      ...snapshot,
      project: update(project),
      revision: 4
    })),
    currentTemplate: vi.fn(() => undefined),
    setCurrentTemplate: vi.fn(),
    updateDraft: vi.fn()
  };
  const controller = {
    newProject: vi.fn().mockResolvedValue({ canceled: false, summary: snapshot }),
    openProject: vi.fn().mockResolvedValue({ canceled: false, summary: snapshot }),
    updateDraft: vi.fn().mockResolvedValue({ accepted: true, revision: 4 }),
    save: vi.fn().mockResolvedValue({ canceled: false, summary: { ...snapshot, dirty: false, revision: 4 } }),
    validate: vi.fn().mockResolvedValue([{ code: 'WARN' }]),
    export: vi.fn().mockResolvedValue({
      canceled: false,
      path: 'C:\\out\\package.zip',
      packageId: 'PKG-1',
      fileCount: 9
    } satisfies ExportResult)
  };
  const dependencies = {
    manager,
    controllerFor: vi.fn(() => controller),
    selectTarget: vi.fn().mockResolvedValue(selectedDocument),
    selectReferences: vi.fn().mockResolvedValue([selectedDocument]),
    pickTemplateSavePath: vi.fn().mockResolvedValue('C:\\out\\template.clmcheck'),
    pickTemplateOpenPath: vi.fn().mockResolvedValue('C:\\in\\template.clmcheck'),
    acknowledgeClose: vi.fn(),
    measureOutput: vi.fn().mockResolvedValue(1234),
    allowedOutputPaths: new Set<string>()
  } as unknown as SessionHandlerDependencies;
  return { active, controller, dependencies, manager, registry, store };
};

describe('createSessionHandlers', () => {
  it('delegates the controller-owned operations and preserves their results', async () => {
    const fixture = createFixture();
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.newProject](context, 'document_generation')).resolves.toEqual({
      canceled: false,
      summary: snapshot
    });
    await expect(handlers[IPC.openProject](context)).resolves.toEqual({ canceled: false, summary: snapshot });
    await expect(handlers[IPC.saveProject](context, false)).resolves.toMatchObject({
      canceled: false,
      summary: { dirty: false, revision: 4 }
    });
    await expect(handlers[IPC.validateProject](context)).resolves.toEqual([{ code: 'WARN' }]);
    await expect(handlers[IPC.exportPackage](context)).resolves.toEqual({
      canceled: false,
      path: 'C:\\out\\package.zip',
      packageId: 'PKG-1',
      fileCount: 9,
      sizeBytes: 1234
    });

    expect(fixture.controller.newProject).toHaveBeenCalledWith('document_generation');
    expect(fixture.controller.openProject).toHaveBeenCalledOnce();
    expect(fixture.controller.save).toHaveBeenCalledWith(false);
    expect(fixture.controller.validate).toHaveBeenCalledWith();
    expect(fixture.controller.export).toHaveBeenCalledOnce();
    expect(fixture.dependencies.measureOutput).toHaveBeenCalledWith('C:\\out\\package.zip');
    expect(fixture.dependencies.allowedOutputPaths).toEqual(new Set(['C:\\out\\package.zip']));
  });

  it('rejects invalid mode, revision, saveAs, and close request id before delegation', async () => {
    const fixture = createFixture();
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.newProject](context, 'wrong')).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
      message: '入力データが不正です。'
    });
    await expect(handlers[IPC.updateProject](context, project, 0)).rejects.toBeInstanceOf(UserFacingError);
    await expect(handlers[IPC.updateProject](context, project, 1.5)).rejects.toBeInstanceOf(UserFacingError);
    await expect(handlers[IPC.saveProject](context, 'false')).rejects.toBeInstanceOf(UserFacingError);
    await expect(handlers[IPC.closeReady](context, 99)).rejects.toBeInstanceOf(UserFacingError);

    expect(fixture.dependencies.controllerFor).not.toHaveBeenCalled();
    expect(fixture.dependencies.acknowledgeClose).not.toHaveBeenCalled();
  });

  it('passes malformed project topology to the controller but never directly to the manager', async () => {
    const fixture = createFixture();
    const malformed = { ...project, references: 'not-an-array' };
    vi.mocked(fixture.controller.updateDraft).mockRejectedValue(
      new UserFacingError('PROJECT_INVALID', 'プロジェクトデータが不正です。')
    );
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.updateProject](context, malformed, 4)).rejects.toMatchObject({
      code: 'PROJECT_INVALID'
    });

    expect(fixture.controller.updateDraft).toHaveBeenCalledWith(malformed, 4);
    expect(fixture.manager.updateDraft).not.toHaveBeenCalled();
  });

  it('selects the target and references exclusively with the active registry', async () => {
    const fixture = createFixture();
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.selectTarget](context)).resolves.toMatchObject({
      revision: 4,
      project: { target: selectedDocument }
    });
    await expect(handlers[IPC.selectReferences](context)).resolves.toEqual([selectedDocument]);

    expect(fixture.manager.runExclusive).toHaveBeenCalledTimes(2);
    expect(fixture.dependencies.selectTarget).toHaveBeenCalledWith(context.senderId, fixture.registry);
    expect(fixture.dependencies.selectReferences).toHaveBeenCalledWith(context.senderId, fixture.registry);
    expect(fixture.manager.applyMainUpdate).toHaveBeenCalledOnce();
  });

  it('saves and opens templates only through the active context store', async () => {
    const fixture = createFixture();
    const existing = { ...template, revision: 0 };
    fixture.manager.currentTemplate.mockReturnValue(existing);
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.saveTemplate](context)).resolves.toEqual({
      canceled: false,
      path: 'C:\\out\\template.clmcheck'
    });
    await expect(handlers[IPC.openTemplate](context)).resolves.toEqual(template);

    expect(fixture.store.saveTemplate).toHaveBeenCalledWith(
      'C:\\out\\template.clmcheck',
      fixture.active.project,
      existing
    );
    expect(fixture.store.openTemplate).toHaveBeenCalledWith('C:\\in\\template.clmcheck');
    expect(fixture.manager.setCurrentTemplate).toHaveBeenNthCalledWith(1, template);
    expect(fixture.manager.setCurrentTemplate).toHaveBeenNthCalledWith(2, template);
  });

  it('acknowledges close only for the invoking sender', async () => {
    const fixture = createFixture();
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.closeReady](context, 'REQ-1')).resolves.toBeUndefined();

    expect(fixture.dependencies.acknowledgeClose).toHaveBeenCalledWith(41, 'REQ-1');
  });

  it('wraps registry, template-store, and output-stat failures without exposing their details', async () => {
    const fixture = createFixture();
    const registryCause = new Error('C:\\secret\\target.md EACCES');
    vi.mocked(fixture.dependencies.selectTarget).mockRejectedValue(registryCause);
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.selectTarget](context)).rejects.toMatchObject({
      code: 'DOCUMENT_REGISTER_FAILED',
      message: '文書を登録できませんでした。ファイルを確認してください。',
      cause: registryCause
    });

    const storeCause = new Error('C:\\secret\\template.clmcheck EACCES');
    vi.mocked(fixture.dependencies.selectTarget).mockResolvedValue(selectedDocument);
    fixture.store.saveTemplate.mockRejectedValue(storeCause);
    await expect(handlers[IPC.saveTemplate](context)).rejects.toMatchObject({
      code: 'TEMPLATE_SAVE_FAILED',
      message: 'テンプレートを保存できませんでした。保存先とアクセス権を確認してください。',
      cause: storeCause
    });
    const unsafeStoreCause = new UserFacingError(
      'DEPENDENCY_RAW',
      'C:\\secret\\template.clmcheck\n    at template:save'
    );
    fixture.store.saveTemplate.mockRejectedValue(unsafeStoreCause);
    await expect(handlers[IPC.saveTemplate](context)).rejects.toMatchObject({
      code: 'TEMPLATE_SAVE_FAILED',
      message: 'テンプレートを保存できませんでした。保存先とアクセス権を確認してください。',
      cause: unsafeStoreCause
    });

    const statCause = new Error('C:\\secret\\package.zip missing');
    vi.mocked(fixture.dependencies.measureOutput).mockRejectedValue(statCause);
    await expect(handlers[IPC.exportPackage](context)).rejects.toMatchObject({
      code: 'PACKAGE_EXPORT_FAILED',
      message: 'パッケージを作成できませんでした。保存先とアクセス権を確認してください。',
      cause: statCause
    });
    const unsafeStatCause = new UserFacingError(
      'DEPENDENCY_RAW',
      'C:\\secret\\package.zip\n    at package:stat'
    );
    vi.mocked(fixture.dependencies.measureOutput).mockRejectedValue(unsafeStatCause);
    await expect(handlers[IPC.exportPackage](context)).rejects.toMatchObject({
      code: 'PACKAGE_EXPORT_FAILED',
      message: 'パッケージを作成できませんでした。保存先とアクセス権を確認してください。',
      cause: unsafeStatCause
    });
    expect(fixture.dependencies.allowedOutputPaths).not.toContain('C:\\out\\package.zip');
  });

  it('replaces an unsafe dependency UserFacingError before IPC and Preload can expose it', async () => {
    const fixture = createFixture();
    const unsafeMessage = "C:\\secret\\customer.clmcheck\n    at dependency stack\nproject:save";
    const dependencyError = new UserFacingError('DEPENDENCY_RAW', unsafeMessage);
    vi.mocked(fixture.dependencies.selectTarget).mockRejectedValue(dependencyError);
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.selectTarget](context)).rejects.toMatchObject({
      code: 'DOCUMENT_REGISTER_FAILED',
      message: '文書を登録できませんでした。ファイルを確認してください。',
      cause: dependencyError
    });

    const envelope = await runIpcOperation(() => handlers[IPC.selectTarget](context));
    expect(JSON.stringify(envelope)).not.toContain('C:\\\\secret');
    expect(JSON.stringify(envelope)).not.toContain('dependency stack');
    expect(JSON.stringify(envelope)).not.toContain('project:save');

    const bridge = createBridge({
      invoke: vi.fn().mockResolvedValue(envelope),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    await expect(bridge.selectTarget()).rejects.toThrow(
      '文書を登録できませんでした。ファイルを確認してください。'
    );
    await expect(bridge.selectTarget()).rejects.not.toThrow('project:save');
  });

  it('replaces an unsafe package dependency UserFacingError at the export boundary', async () => {
    const fixture = createFixture();
    const unsafeMessage = "C:\\secret\\package.zip\n    at package dependency stack\npackage:export";
    const dependencyError = new UserFacingError('DEPENDENCY_RAW', unsafeMessage);
    fixture.controller.export.mockRejectedValue(dependencyError);
    const handlers = createSessionHandlers(fixture.dependencies);

    await expect(handlers[IPC.exportPackage](context)).rejects.toMatchObject({
      code: 'PACKAGE_EXPORT_FAILED',
      message: 'パッケージを作成できませんでした。保存先とアクセス権を確認してください。',
      cause: dependencyError
    });

    const envelope = await runIpcOperation(() => handlers[IPC.exportPackage](context));
    expect(JSON.stringify(envelope)).not.toContain('C:\\\\secret');
    expect(JSON.stringify(envelope)).not.toContain('package dependency stack');
    expect(JSON.stringify(envelope)).not.toContain('package:export');

    const bridge = createBridge({
      invoke: vi.fn().mockResolvedValue(envelope),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    await expect(bridge.exportPackage()).rejects.toThrow(
      'パッケージを作成できませんでした。保存先とアクセス権を確認してください。'
    );
    await expect(bridge.exportPackage()).rejects.not.toThrow('package:export');
  });

  it('contains each session invoke channel exactly once and excludes direct handlers', () => {
    const handlers = createSessionHandlers(createFixture().dependencies);

    expect(Object.keys(handlers)).toEqual(SESSION_INVOKE_CHANNELS);
    expect(new Set(Object.keys(handlers)).size).toBe(SESSION_INVOKE_CHANNELS.length);
    expect(Object.keys(handlers)).not.toContain(IPC.openFolder);
    expect(Object.keys(handlers)).not.toContain(IPC.versions);
  });
});
