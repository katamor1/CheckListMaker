import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProject } from '../src/shared/defaults.js';
import { DocumentRegistry } from '../src/main/document-registry.js';
import { ProjectStore } from '../src/main/project-store.js';
import { jsonBytes, sha256 } from '../src/main/crypto.js';
import { writeArchive } from '../src/main/archive.js';
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

const deferred = (): {
  promise: Promise<void>;
  resolve: () => void;
} => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const completesWithin = async <T>(operation: Promise<T>, timeoutMs = 250): Promise<T> => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error('exclusive operation timed out')), timeoutMs);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
};

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

  it('runs queued operations once in submission order and continues after rejection', async () => {
    const manager = new ProjectSessionManager(resources);
    const firstGate = deferred();
    const calls: string[] = [];
    const firstOperation = vi.fn(async () => {
      calls.push('first:start');
      await firstGate.promise;
      calls.push('first:end');
      return 1;
    });
    const rejectingOperation = vi.fn(async () => {
      calls.push('second:reject');
      throw new Error('expected rejection');
    });
    const finalOperation = vi.fn(() => {
      calls.push('third:complete');
      return 3;
    });

    const first = manager.runExclusive(firstOperation);
    const rejecting = manager.runExclusive(rejectingOperation);
    const final = manager.runExclusive(finalOperation);
    const rejection = expect(rejecting).rejects.toThrow('expected rejection');
    await vi.waitFor(() => expect(calls).toEqual(['first:start']));
    expect(rejectingOperation).not.toHaveBeenCalled();
    expect(finalOperation).not.toHaveBeenCalled();

    firstGate.resolve();

    await expect(first).resolves.toBe(1);
    await rejection;
    await expect(final).resolves.toBe(3);
    expect(calls).toEqual(['first:start', 'first:end', 'second:reject', 'third:complete']);
    expect(firstOperation).toHaveBeenCalledOnce();
    expect(rejectingOperation).toHaveBeenCalledOnce();
    expect(finalOperation).toHaveBeenCalledOnce();
  });

  it('completes a public save reentered from the same exclusive operation', async () => {
    const activeResources = resources();
    const manager = new ProjectSessionManager(() => activeResources);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    manager.replaceCurrent(candidate);
    const pickPath = vi.fn().mockResolvedValue('C:\\work\\nested.clmproj');

    const result = await completesWithin(
      manager.runExclusive(() => manager.saveCurrent(false, pickPath))
    );

    expect(result).toMatchObject({ canceled: false, path: 'C:\\work\\nested.clmproj' });
    expect(activeResources.store.saveProject).toHaveBeenCalledOnce();
    expect(pickPath).toHaveBeenCalledOnce();
  });

  it('queues an external save while allowing only same-context save reentry inline', async () => {
    const activeResources = resources();
    const manager = new ProjectSessionManager(() => activeResources);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    manager.replaceCurrent(candidate);
    const ownerStarted = deferred();
    const allowNestedSave = deferred();
    const events: string[] = [];
    vi.mocked(activeResources.store.saveProject).mockImplementation(async (path) => {
      events.push(`save:${path}`);
    });
    const nestedPath = 'C:\\work\\nested.clmproj';
    const externalPath = 'C:\\work\\external.clmproj';
    const owner = manager.runExclusive(async () => {
      events.push('owner:start');
      ownerStarted.resolve();
      await allowNestedSave.promise;
      const result = await manager.saveCurrent(true, vi.fn().mockResolvedValue(nestedPath));
      events.push('owner:end');
      return result;
    });

    await ownerStarted.promise;
    const external = manager.saveCurrent(true, vi.fn().mockResolvedValue(externalPath));
    await Promise.resolve();
    await Promise.resolve();
    const eventsBeforeOwnerRelease = [...events];
    allowNestedSave.resolve();
    const [ownerResult, externalResult] = await completesWithin(Promise.all([owner, external]));

    expect(eventsBeforeOwnerRelease).toEqual(['owner:start']);
    expect(events).toEqual([
      'owner:start',
      `save:${nestedPath}`,
      'owner:end',
      `save:${externalPath}`
    ]);
    expect(ownerResult.path).toBe(nestedPath);
    expect(externalResult.path).toBe(externalPath);
    expect(activeResources.store.saveProject).toHaveBeenCalledTimes(2);
  });

  it('queues a child context resumed after its owner completes behind the current blocker', async () => {
    const manager = new ProjectSessionManager(resources);
    const resumeChild = deferred();
    const blockerStarted = deferred();
    const releaseBlocker = deferred();
    const events: string[] = [];
    let child!: Promise<string>;
    await manager.runExclusive(() => {
      events.push('owner:complete');
      child = (async () => {
        await resumeChild.promise;
        return manager.runExclusive(() => {
          events.push('child:complete');
          return 'child result';
        });
      })();
    });
    const blocker = manager.runExclusive(async () => {
      events.push('blocker:start');
      blockerStarted.resolve();
      await releaseBlocker.promise;
      events.push('blocker:end');
    });
    await blockerStarted.promise;

    resumeChild.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const eventsBeforeBlockerRelease = [...events];
    releaseBlocker.resolve();
    const [childResult] = await completesWithin(Promise.all([child, blocker]));

    expect(eventsBeforeBlockerRelease).toEqual(['owner:complete', 'blocker:start']);
    expect(events).toEqual(['owner:complete', 'blocker:start', 'blocker:end', 'child:complete']);
    expect(childResult).toBe('child result');
  });

  it('keeps manager B queued behind its blocker when called from manager A context', async () => {
    const managerA = new ProjectSessionManager(resources);
    const managerB = new ProjectSessionManager(resources);
    const blockerStarted = deferred();
    const releaseBlocker = deferred();
    const events: string[] = [];
    const blocker = managerB.runExclusive(async () => {
      events.push('managerB:blocker:start');
      blockerStarted.resolve();
      await releaseBlocker.promise;
      events.push('managerB:blocker:end');
    });
    await blockerStarted.promise;

    const managerACall = managerA.runExclusive(async () => {
      events.push('managerA:start');
      const result = await managerB.runExclusive(() => {
        events.push('managerB:operation');
        return 'manager B result';
      });
      events.push('managerA:end');
      return result;
    });
    await Promise.resolve();
    await Promise.resolve();
    const eventsBeforeBlockerRelease = [...events];
    releaseBlocker.resolve();
    const [, managerAResult] = await completesWithin(Promise.all([blocker, managerACall]));

    expect(eventsBeforeBlockerRelease).toEqual(['managerB:blocker:start', 'managerA:start']);
    expect(events).toEqual([
      'managerB:blocker:start',
      'managerA:start',
      'managerB:blocker:end',
      'managerB:operation',
      'managerA:end'
    ]);
    expect(managerAResult).toBe('manager B result');
  });

  it('deactivates a child context after a synchronous owner throw and recovers the tail', async () => {
    const manager = new ProjectSessionManager(resources);
    const resumeChild = deferred();
    const blockerStarted = deferred();
    const releaseBlocker = deferred();
    const events: string[] = [];
    let child!: Promise<string>;
    const throwingOwner = manager.runExclusive(() => {
      events.push('owner:throw');
      child = (async () => {
        await resumeChild.promise;
        return manager.runExclusive(() => {
          events.push('child:complete');
          return 'child recovered';
        });
      })();
      throw new Error('expected owner failure');
    });
    await expect(throwingOwner).rejects.toThrow('expected owner failure');
    const blocker = manager.runExclusive(async () => {
      events.push('blocker:start');
      blockerStarted.resolve();
      await releaseBlocker.promise;
      events.push('blocker:end');
    });
    await blockerStarted.promise;

    resumeChild.resolve();
    await Promise.resolve();
    await Promise.resolve();
    const eventsBeforeBlockerRelease = [...events];
    releaseBlocker.resolve();
    const [childResult] = await completesWithin(Promise.all([child, blocker]));

    expect(eventsBeforeBlockerRelease).toEqual(['owner:throw', 'blocker:start']);
    expect(events).toEqual(['owner:throw', 'blocker:start', 'blocker:end', 'child:complete']);
    expect(childResult).toBe('child recovered');
    await expect(manager.runExclusive(() => 'tail recovered')).resolves.toBe('tail recovered');
  });

  it('awaits custom thenables once and recovers the queue after thenable rejection', async () => {
    const manager = new ProjectSessionManager(resources);
    const releaseResolution = deferred();
    const events: string[] = [];
    const resolvingThenCall = vi.fn();
    const rejectingThenCall = vi.fn();
    const resolvingOperation = vi.fn(() => ({
      then(resolve: (value: string) => void): void {
        resolvingThenCall();
        events.push('resolve:wait');
        void releaseResolution.promise.then(() => {
          events.push('resolve:complete');
          resolve('resolved thenable');
        });
      }
    }));
    const rejectingOperation = vi.fn(() => ({
      then(_resolve: (value: never) => void, reject: (reason: unknown) => void): void {
        rejectingThenCall();
        events.push('reject:complete');
        reject(new Error('expected thenable rejection'));
      }
    }));
    const finalOperation = vi.fn(() => {
      events.push('final:complete');
      return 'queue recovered';
    });

    const resolving = manager.runExclusive(resolvingOperation);
    const rejecting = manager.runExclusive(rejectingOperation);
    const final = manager.runExclusive(finalOperation);
    const rejection = expect(rejecting).rejects.toThrow('expected thenable rejection');
    await vi.waitFor(() => expect(events).toEqual(['resolve:wait']));
    expect(rejectingOperation).not.toHaveBeenCalled();
    expect(finalOperation).not.toHaveBeenCalled();

    releaseResolution.resolve();

    await expect(resolving).resolves.toBe('resolved thenable');
    await rejection;
    await expect(final).resolves.toBe('queue recovered');
    expect(events).toEqual([
      'resolve:wait',
      'resolve:complete',
      'reject:complete',
      'final:complete'
    ]);
    expect(resolvingOperation).toHaveBeenCalledOnce();
    expect(rejectingOperation).toHaveBeenCalledOnce();
    expect(finalOperation).toHaveBeenCalledOnce();
    expect(resolvingThenCall).toHaveBeenCalledOnce();
    expect(rejectingThenCall).toHaveBeenCalledOnce();
  });

  it('routes public saves through the same exclusive session queue', async () => {
    const activeResources = resources();
    const manager = new ProjectSessionManager(() => activeResources);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    manager.replaceCurrent(candidate);
    const blockerStarted = deferred();
    const releaseBlocker = deferred();
    const blocker = manager.runExclusive(async () => {
      blockerStarted.resolve();
      await releaseBlocker.promise;
    });

    const saving = manager.saveCurrent(true, vi.fn().mockResolvedValue('C:\\work\\queued.clmproj'));
    await blockerStarted.promise;
    await Promise.resolve();
    await Promise.resolve();
    const callsBeforeRelease = vi.mocked(activeResources.store.saveProject).mock.calls.length;
    releaseBlocker.resolve();

    await blocker;
    await expect(saving).resolves.toMatchObject({ canceled: false, path: 'C:\\work\\queued.clmproj' });
    expect(callsBeforeRelease).toBe(0);
    expect(activeResources.store.saveProject).toHaveBeenCalledOnce();
  });

  it('serializes concurrent public saves so the final path and project describe the same save', async () => {
    const activeResources = resources();
    const firstPath = 'C:\\work\\first.clmproj';
    const secondPath = 'C:\\work\\second.clmproj';
    const firstStarted = deferred();
    const secondStarted = deferred();
    const releaseFirst = deferred();
    const releaseSecond = deferred();
    const startedPaths: string[] = [];
    vi.mocked(activeResources.store.saveProject).mockImplementation(async (path) => {
      startedPaths.push(path);
      if (path === firstPath) {
        firstStarted.resolve();
        await releaseFirst.promise;
        return;
      }
      secondStarted.resolve();
      await releaseSecond.promise;
    });
    const timestamps = [
      new Date('2025-01-02T03:04:05.000Z'),
      new Date('2025-01-02T03:04:06.000Z')
    ];
    let timestampIndex = 0;
    const manager = new ProjectSessionManager(
      () => activeResources,
      () => timestamps[timestampIndex++]!
    );
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    manager.replaceCurrent(candidate);

    const firstSave = manager.saveCurrent(true, vi.fn().mockResolvedValue(firstPath));
    const secondSave = manager.saveCurrent(true, vi.fn().mockResolvedValue(secondPath));
    await firstStarted.promise;
    await Promise.resolve();
    await Promise.resolve();
    const pathsBeforeFirstCompletion = [...startedPaths];
    releaseFirst.resolve();
    await secondStarted.promise;
    releaseSecond.resolve();
    const [firstResult, secondResult] = await Promise.all([firstSave, secondSave]);
    const final = manager.currentSummary();

    expect(pathsBeforeFirstCompletion).toEqual([firstPath]);
    expect(startedPaths).toEqual([firstPath, secondPath]);
    expect(firstResult.summary.path).toBe(firstPath);
    expect(final.path).toBe(secondPath);
    expect(final.project).toEqual(secondResult.project);
    expect(secondResult.summary).toEqual(final);
    expect(final.project.updatedAt).toBe('2025-01-02T03:04:06.000Z');
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

  it('keeps the old path and exact snapshot when save-as fails', async () => {
    const activeResources = resources();
    vi.mocked(activeResources.store.saveProject).mockRejectedValue(new Error('access denied'));
    const manager = new ProjectSessionManager(() => activeResources);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    candidate.path = 'C:\\work\\existing.clmproj';
    manager.replaceCurrent(candidate);
    const before = manager.currentSummary();

    await expect(
      manager.saveCurrent(true, vi.fn().mockResolvedValue('C:\\work\\replacement.clmproj'))
    ).rejects.toMatchObject({
      code: 'PROJECT_SAVE_FAILED',
      message: 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
    });

    expect(manager.currentSummary()).toEqual(before);
    expect(manager.currentSummary().path).toBe('C:\\work\\existing.clmproj');
  });

  it('preserves a draft accepted while an in-flight save later fails', async () => {
    const activeResources = resources();
    const saveStarted = deferred();
    const releaseSave = deferred();
    vi.mocked(activeResources.store.saveProject).mockImplementation(async () => {
      saveStarted.resolve();
      await releaseSave.promise;
      throw new Error('disk full');
    });
    const manager = new ProjectSessionManager(() => activeResources);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    candidate.path = 'C:\\work\\existing.clmproj';
    manager.replaceCurrent(candidate);

    const saving = manager.saveCurrent(false, vi.fn());
    const failure = expect(saving).rejects.toMatchObject({
      code: 'PROJECT_SAVE_FAILED',
      message: 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
    });
    await saveStarted.promise;
    const savingProject = manager.currentSummary().project;
    expect(manager.updateDraft({ ...savingProject, name: '失敗後も残す入力' }, 1)).toBe(true);
    releaseSave.resolve();
    await failure;

    expect(manager.currentSummary()).toMatchObject({
      path: 'C:\\work\\existing.clmproj',
      dirty: true,
      revision: 1,
      project: { name: '失敗後も残す入力' }
    });
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

  it('uses one fixed manager timestamp for the save result, snapshot, and reopened project', async () => {
    const directory = await createTemporaryDirectory();
    const projectPath = join(directory, 'manager-timestamp.clmproj');
    const activeRegistry = new DocumentRegistry();
    const activeResources: SessionResources = {
      registry: activeRegistry,
      store: new ProjectStore(activeRegistry),
      packageGenerator: { generate: vi.fn() }
    };
    const fixedNow = new Date('2025-06-07T08:09:10.000Z');
    const manager = new ProjectSessionManager(() => activeResources, () => fixedNow);
    const candidate = manager.createCandidate('document_generation');
    candidate.project.generation = { ...candidate.project.generation!, instructions: '概要を作成する' };
    manager.replaceCurrent(candidate);

    const result = await manager.saveCurrent(false, vi.fn().mockResolvedValue(projectPath));
    const reopened = await new ProjectStore(new DocumentRegistry()).openProject(projectPath);

    expect(result.project?.updatedAt).toBe(fixedNow.toISOString());
    expect(result.project).toEqual(result.summary.project);
    expect(reopened).toEqual(result.project);
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

  it.each(['../../poison.md', 'documents/missing.md'])(
    'rejects malformed archive topology before looking up stored path %s',
    async (storedPath) => {
      const directory = await createTemporaryDirectory();
      const projectPath = join(directory, 'malformed.clmproj');
      const project = createProject('existing_document');
      const malformed = {
        ...project,
        target: {
          token: '',
          originalFileName: 'target.md',
          storedPath,
          mediaType: 'text/markdown',
          sizeBytes: 4,
          sha256: 'a'.repeat(64),
          format: 'md',
          editable: true
        },
        references: null
      };
      const { checklist, ...metadata } = malformed;
      await writeArchive(projectPath, [
        {
          path: 'project.json',
          role: 'project',
          mediaType: 'application/json',
          bytes: jsonBytes(metadata),
          readOnly: true
        },
        {
          path: 'checklist.json',
          role: 'checklist',
          mediaType: 'application/json',
          bytes: jsonBytes(checklist),
          readOnly: true
        }
      ]);

      await expect(new ProjectStore(new DocumentRegistry()).openProject(projectPath)).rejects.toEqual(
        new Error('プロジェクトデータの構造が不正です。')
      );
    }
  );

  it('isolates active resources when a candidate store mutates its registry before failing', async () => {
    const activeResources = resources();
    const candidateResources = resources();
    const activeBytes = Buffer.from('active');
    const activeDocument = activeResources.registry.registerBytes({
      originalFileName: 'active.md',
      storedPath: 'documents/active.md',
      mediaType: 'text/markdown',
      sizeBytes: activeBytes.byteLength,
      sha256: sha256(activeBytes),
      format: 'md',
      editable: true
    }, activeBytes);
    let candidateToken = '';
    vi.mocked(candidateResources.store.openProject).mockImplementation(async () => {
      const candidateBytes = Buffer.from('candidate');
      candidateToken = candidateResources.registry.registerBytes({
        originalFileName: 'candidate.md',
        storedPath: 'documents/candidate.md',
        mediaType: 'text/markdown',
        sizeBytes: candidateBytes.byteLength,
        sha256: sha256(candidateBytes),
        format: 'md',
        editable: true
      }, candidateBytes).token;
      throw new Error('broken after registry mutation');
    });
    const factory = vi.fn()
      .mockReturnValueOnce(activeResources)
      .mockReturnValueOnce(candidateResources);
    const manager = new ProjectSessionManager(factory);
    manager.replaceCurrent(manager.createCandidate('document_generation'));
    const before = manager.currentSummary();

    await expect(manager.loadCandidate('broken.clmproj')).rejects.toMatchObject({
      code: 'PROJECT_OPEN_FAILED',
      message: 'プロジェクトを開けませんでした。ファイルが破損しているか、対応していない形式です。'
    });

    expect(manager.currentSummary()).toEqual(before);
    expect(activeResources.registry.has(activeDocument.token)).toBe(true);
    expect(activeResources.registry.has(candidateToken)).toBe(false);
    expect(candidateResources.registry.has(candidateToken)).toBe(true);
  });
});
