import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../src/shared/defaults.js';
import { DocumentRegistry } from '../src/main/document-registry.js';
import { ProjectStore } from '../src/main/project-store.js';
import { sha256 } from '../src/main/crypto.js';
import {
  ProjectSessionManager,
  type SessionResources
} from '../src/main/project-session.js';

const resources = (): SessionResources => ({
  registry: new DocumentRegistry(),
  store: {
    openProject: vi.fn(),
    saveProject: vi.fn().mockResolvedValue(undefined),
    saveTemplate: vi.fn(),
    openTemplate: vi.fn()
  },
  packageGenerator: {
    generate: vi.fn()
  }
});

const temporaryDirectories: string[] = [];

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'checklistmaker-session-'));
  temporaryDirectories.push(directory);
  return directory;
};

afterEach(async () => {
  for (const directory of temporaryDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe('ProjectSessionManager', () => {
  it('starts without an active session', () => {
    const manager = new ProjectSessionManager(resources);
    expect(manager.hasCurrent()).toBe(false);
  });

  it('does not mutate the active session while creating a candidate', () => {
    const manager = new ProjectSessionManager(resources);
    const first = manager.createCandidate('existing_document');
    manager.replaceCurrent(first);
    const before = manager.currentSummary();

    const candidate = manager.createCandidate('document_generation');

    expect(manager.currentSummary()).toEqual(before);
    expect(candidate.project.mode).toBe('document_generation');
  });

  it('ignores stale or cross-project draft updates', () => {
    const manager = new ProjectSessionManager(resources);
    const candidate = manager.createCandidate('document_generation');
    manager.replaceCurrent(candidate);
    const current = manager.requireCurrent();
    const edited = { ...current.project, name: '最新' };

    expect(manager.updateDraft(edited, 1)).toBe(true);
    expect(manager.updateDraft({ ...edited, name: '古い' }, 1)).toBe(false);
    expect(manager.updateDraft(createProject('document_generation'), 2)).toBe(false);
    expect(manager.currentSummary().project.name).toBe('最新');
  });

  it('keeps the active session when candidate loading fails', async () => {
    const activeResources = resources();
    const failingResources = resources();
    vi.mocked(failingResources.store.openProject).mockRejectedValue(new Error('broken archive'));
    const factory = vi.fn()
      .mockReturnValueOnce(activeResources)
      .mockReturnValueOnce(failingResources);
    const manager = new ProjectSessionManager(factory);
    manager.replaceCurrent(manager.createCandidate('existing_document'));
    const before = manager.currentSummary();

    await expect(manager.loadCandidate('broken.clmproj')).rejects.toThrow(
      'プロジェクトを開けませんでした。ファイルが破損しているか、対応していない形式です。'
    );
    expect(manager.currentSummary()).toEqual(before);
  });

  it('marks a successfully saved session clean and advances its revision', async () => {
    const activeResources = resources();
    const manager = new ProjectSessionManager(() => activeResources);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    manager.replaceCurrent(candidate);
    const pickPath = vi.fn().mockResolvedValue('C:\\work\\project.clmproj');

    const result = await manager.saveCurrent(false, pickPath);

    expect(result.canceled).toBe(false);
    expect(manager.currentSummary().dirty).toBe(false);
    expect(manager.currentSummary().path).toBe('C:\\work\\project.clmproj');
    expect(manager.currentSummary().revision).toBe(1);
    expect(result.summary).toEqual(manager.currentSummary());
  });

  it('applies a Main-owned edit through the same revision and dirty rules', () => {
    const manager = new ProjectSessionManager(resources);
    manager.replaceCurrent(manager.createCandidate('existing_document'));

    const summary = manager.applyMainUpdate((project) => ({
      ...project,
      name: 'Main更新'
    }));

    expect(summary.project.name).toBe('Main更新');
    expect(summary.dirty).toBe(true);
    expect(summary.revision).toBe(1);
  });

  it('keeps a canceled save completely unchanged', async () => {
    const activeResources = resources();
    const manager = new ProjectSessionManager(() => activeResources);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    manager.replaceCurrent(candidate);
    const before = manager.currentSummary();

    const result = await manager.saveCurrent(false, vi.fn().mockResolvedValue(undefined));

    expect(result).toEqual({ canceled: true, summary: before });
    expect(manager.currentSummary()).toEqual(before);
    expect(activeResources.store.saveProject).not.toHaveBeenCalled();
  });

  it('does not overwrite a draft accepted while a save is in flight', async () => {
    const activeResources = resources();
    let signalStarted!: () => void;
    let releaseSave!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const blocked = new Promise<void>((resolve) => { releaseSave = resolve; });
    vi.mocked(activeResources.store.saveProject).mockImplementation(async () => {
      signalStarted();
      await blocked;
    });
    const manager = new ProjectSessionManager(() => activeResources);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    manager.replaceCurrent(candidate);

    const saving = manager.saveCurrent(false, vi.fn().mockResolvedValue('C:\\work\\project.clmproj'));
    await started;
    const beforeDraft = manager.currentSummary().project;
    expect(manager.updateDraft({ ...beforeDraft, name: '保存中の追加入力' }, 1)).toBe(true);
    releaseSave();
    const result = await saving;

    expect(result.summary.project.name).toBe('保存中の追加入力');
    expect(result.summary.dirty).toBe(true);
    expect(result.summary.revision).toBe(1);
  });

  it('reopens the exact project passed to the real store without changing its timestamp', async () => {
    const directory = await createTemporaryDirectory();
    const projectPath = join(directory, 'timestamp.clmproj');
    const project = createProject('document_generation');
    project.generation = { ...project.generation!, instructions: '概要を作成する' };
    project.updatedAt = '2025-01-02T03:04:05.000Z';

    await new ProjectStore(new DocumentRegistry()).saveProject(projectPath, project);
    const reopened = await new ProjectStore(new DocumentRegistry()).openProject(projectPath);

    expect(reopened).toEqual(project);
  });

  it('restores archive documents with live tokens owned by the fresh registry', async () => {
    const directory = await createTemporaryDirectory();
    const projectPath = join(directory, 'documents.clmproj');
    const sourceRegistry = new DocumentRegistry();
    const bytes = Buffer.from('# 対象文書');
    const target = sourceRegistry.registerBytes({
      originalFileName: 'target.md',
      storedPath: 'documents/target.md',
      mediaType: 'text/markdown',
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
      format: 'md',
      editable: true
    }, bytes);
    const project = { ...createProject('existing_document'), target };
    await new ProjectStore(sourceRegistry).saveProject(projectPath, project);
    const freshRegistry = new DocumentRegistry();

    const reopened = await new ProjectStore(freshRegistry).openProject(projectPath);

    expect(reopened.target?.token).toBeTruthy();
    expect(freshRegistry.has(reopened.target!.token)).toBe(true);
  });

  it('rejects unknown target and reference tokens without changing the active snapshot', () => {
    const manager = new ProjectSessionManager(resources);
    manager.replaceCurrent(manager.createCandidate('existing_document'));
    const before = manager.currentSummary();
    const selected = {
      token: 'UNKNOWN-TOKEN',
      originalFileName: 'target.md',
      storedPath: 'documents/target.md',
      mediaType: 'text/markdown',
      sizeBytes: 4,
      sha256: 'a'.repeat(64),
      format: 'md' as const,
      editable: true
    };
    const reference = {
      id: 'REF-001',
      document: selected,
      title: '基準資料',
      purpose: '照合',
      authorityLevel: 'approved' as const,
      priority: 50,
      roleIds: [],
      readOnly: true as const
    };

    expect(() => manager.updateDraft({ ...before.project, target: selected }, 1)).toThrow(
      '選択文書が現在のプロジェクトと一致しません。文書を選択し直してください。'
    );
    expect(manager.currentSummary()).toEqual(before);
    expect(() => manager.updateDraft({ ...before.project, references: [reference] }, 1)).toThrow(
      '選択文書が現在のプロジェクトと一致しません。文書を選択し直してください。'
    );
    expect(manager.currentSummary()).toEqual(before);
  });
});
