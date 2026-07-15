# Electron Project Session Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Main Process the authoritative project-session owner so unsaved changes, failed project loads, window close, export, and IPC errors are handled without data loss or internal error leakage.

**Architecture:** Introduce an Electron-independent `ProjectSessionManager` that owns the active Project, revision, path, dirty state, and matched registry/store/package-generator resources. Build pure workflow and close-coordinator layers around it, then adapt Main IPC, Preload, and Renderer through typed results and revisioned draft synchronization. Candidate projects are loaded into isolated resources and swapped only after load and unsaved-change approval succeed.

**Tech Stack:** Electron 41.2.1, React 19.2.0, TypeScript 5.9.3, Vite 7.1.12, Vitest 3.2.4, Node.js 22+

## Global Constraints

- Do not add dependencies or change `.clmproj`, `.clmcheck`, or Copilot ZIP formats.
- Preserve the existing `GenerationSettingsForm`; do not reimplement or redesign it.
- Keep all app behavior offline and retain the existing external-navigation/network blocks.
- Main Process owns the authoritative session; Renderer state is a synchronized view.
- Serialize every session read/mutation in Main and hold a Renderer operation barrier from pre-flush through the final returned snapshot.
- Candidate open/new contexts must never clear or mutate the active registry before atomic replacement.
- `キャンセル` is the default and cancel action for unsaved-change dialogs.
- Expected business failures return typed user-facing IPC errors; unexpected failures return `処理に失敗しました。再度お試しください。` without channel names, transport prefixes, or stacks.
- Dirty export is a two-stage Renderer action: save through Main, apply the returned clean snapshot, then invoke a Main export that refuses dirty sessions. Cancel or save failure must stop export.
- Keep the sandboxed preload as one emitted script; do not add a runtime `require()` of another local preload file.
- Apply TDD for every new production function: observe the targeted test fail before implementation.
- Preserve the user's untracked `.gitignore`; stage only task-owned files.

---

## File Structure

- Create `src/shared/ipc-result.ts`: typed IPC success/failure envelope, causal `UserFacingError`, and Main operation wrapper.
- Create `src/shared/project-structure.ts`: separate persisted-archive and live-session structural assertions, plus a safe record assertion, all separate from business validation.
- Create `src/main/project-session.ts`: active/candidate session contexts, revision checks, save state, and resource ownership.
- Create `src/main/session-workflows.ts`: unsaved decision, atomic replacement, and clean-only export orchestration.
- Create `src/main/session-controller.ts`: Electron-independent new/open/save/export controller and exclusive operation boundary.
- Create `src/main/session-handlers.ts`: event-context-aware, Electron-object-free IPC handler factory used by Main.
- Create `src/main/close-coordinator.ts`: close-flush request IDs, timeout, acknowledgement, and re-entry control.
- Create `src/main/session-dialogs.ts`: pure unsaved-dialog option/response mapping used by Main.
- Keep `src/preload/preload.ts` as one sandbox-compatible file and export its testable bridge factory from that file.
- Create `src/renderer/draft-synchronizer.ts`: ordered revisioned draft queue and flush/reset behavior.
- Create `src/renderer/session-operation-queue.ts`: testable token-based Renderer operation/close barrier with a settled serial tail.
- Create `src/renderer/session-actions.ts`: save-then-export orchestration that applies the save snapshot before ZIP work.
- Modify `src/shared/model.ts`: session snapshot/result and bridge contracts.
- Modify `src/shared/ipc.ts`: new draft-sync and close-handshake channels.
- Modify `src/main/project-store.ts`: validate loaded structure and make the Manager the sole `updatedAt` owner.
- Modify `src/main/document-registry.ts`: expose a non-I/O token-ownership check for untrusted live drafts.
- Modify `src/main/main.ts`: instantiate session manager, Electron dialog adapters, typed handlers, atomic new/open, export, and close flow.
- Modify `src/preload/preload.ts`: expose the tested bridge directly through `contextBridge` without a local `require()`.
- Modify `src/renderer/App.tsx`: funnel edits through the synchronizer, flush destructive actions, consume snapshots, and acknowledge close requests.
- Modify `tests/generation-settings-form.test.ts`: characterize generation-instruction validation success.
- Create focused tests under `tests/{ipc-result,project-structure,project-session,session-workflows,session-controller,close-coordinator,session-dialogs,preload,draft-synchronizer,session-operation-queue,session-actions}.test.ts`.

---

### Task 1: Safe typed IPC results

**Files:**
- Create: `src/shared/ipc-result.ts`
- Test: `tests/ipc-result.test.ts`

**Interfaces:**
- Consumes: no earlier task interfaces.
- Produces: `IpcResult<T>`, `UserFacingError`, `ipcSuccess()`, `runIpcOperation()`, `GENERIC_USER_MESSAGE`.

- [ ] **Step 1: Write the failing IPC result tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import {
  GENERIC_USER_MESSAGE,
  UserFacingError,
  ipcSuccess,
  runIpcOperation
} from '../src/shared/ipc-result.js';

describe('IPC result boundary', () => {
  it('returns successful values unchanged', async () => {
    await expect(runIpcOperation(async () => 42)).resolves.toEqual(ipcSuccess(42));
  });

  it('preserves only an explicitly user-facing error', async () => {
    const result = await runIpcOperation(async () => {
      throw new UserFacingError('PROJECT_INVALID', '保存できません: 入力を確認してください。');
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'PROJECT_INVALID', message: '保存できません: 入力を確認してください。' }
    });
  });

  it('logs a hidden cause without returning it to the Renderer', async () => {
    const cause = new Error('C:\\private\\project.clmproj: access denied');
    const reportUnexpected = vi.fn();
    const result = await runIpcOperation(async () => {
      throw new UserFacingError(
        'PROJECT_SAVE_FAILED',
        'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。',
        cause
      );
    }, reportUnexpected);

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'PROJECT_SAVE_FAILED',
        message: 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
      }
    });
    expect(reportUnexpected).toHaveBeenCalledWith(cause);
    expect(JSON.stringify(result)).not.toContain('C:\\private');
  });

  it('hides unexpected errors and reports them only to Main logging', async () => {
    const reportUnexpected = vi.fn();
    const result = await runIpcOperation(async () => {
      throw new TypeError('secret stack detail');
    }, reportUnexpected);

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: GENERIC_USER_MESSAGE }
    });
    expect(JSON.stringify(result)).not.toContain('secret stack detail');
    expect(reportUnexpected).toHaveBeenCalledOnce();
  });

});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/ipc-result.test.ts
```

Expected: FAIL because `src/shared/ipc-result.ts` does not exist.

- [ ] **Step 3: Implement the typed result boundary**

```ts
export const GENERIC_USER_MESSAGE = '処理に失敗しました。再度お試しください。';

export type IpcError = { code: string; message: string };
export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: IpcError };

export class UserFacingError extends Error {
  constructor(readonly code: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'UserFacingError';
  }
}

export const ipcSuccess = <T>(value: T): IpcResult<T> => ({ ok: true, value });

export const runIpcOperation = async <T>(
  operation: () => Promise<T> | T,
  reportUnexpected: (error: unknown) => void = () => undefined
): Promise<IpcResult<T>> => {
  try {
    return ipcSuccess(await operation());
  } catch (error) {
    if (error instanceof UserFacingError) {
      if (error.cause !== undefined) reportUnexpected(error.cause);
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    reportUnexpected(error);
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: GENERIC_USER_MESSAGE } };
  }
};

```

- [ ] **Step 4: Run the focused and existing tests and verify GREEN**

Run:

```powershell
npm.cmd test -- tests/ipc-result.test.ts
npm.cmd run typecheck
npm.cmd test
```

Expected: `tests/ipc-result.test.ts` passes, all three TypeScript projects compile, and the full suite has zero failures.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- src/shared/ipc-result.ts tests/ipc-result.test.ts
git commit -m "fix: add safe IPC result contract"
```

---

### Task 2: Authoritative project-session core

**Files:**
- Create: `src/main/project-session.ts`
- Create: `src/shared/project-structure.ts`
- Modify: `src/shared/model.ts`
- Modify: `src/main/document-registry.ts`
- Modify: `src/main/project-store.ts`
- Test: `tests/project-session.test.ts`
- Test: `tests/project-structure.test.ts`

**Interfaces:**
- Consumes: `UserFacingError` from Task 1; existing `createProject()`, `validateProject()`, `DocumentRegistry`, `ProjectStore`, and `CopilotPackageGenerator`.
- Produces: `SessionSnapshot`, `SessionSaveResult`, `SessionChangeResult`, `DraftUpdateResult`, `SessionResources`, `ProjectSessionContext`, `ProjectSessionManager`, `SavePathPicker`, `assertRecord()`, `assertPersistedProjectDefinition()`, `assertProjectDefinition()`, and `DocumentRegistry.has()`.

- [ ] **Step 1: Add the session snapshot contract to `src/shared/model.ts` in the test first**

The test imports the wished-for types and behavior:

```ts
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import { DocumentRegistry } from '../src/main/document-registry.js';
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
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd test -- tests/project-session.test.ts
```

Expected: FAIL because `ProjectSessionManager`, `SessionSnapshot`, and `SessionSaveResult` do not exist.

- [ ] **Step 3: Add the revisioned in-memory result contracts**

Keep `ProjectSummary` compatible and add IPC-only session contracts without changing persisted project formats:

```ts
export interface ProjectSummary {
  path?: string;
  project: ProjectDefinition;
  dirty: boolean;
}

export interface SessionSnapshot extends ProjectSummary {
  revision: number;
}

export interface SessionSaveResult extends SaveResult {
  summary: SessionSnapshot;
}

export interface SessionChangeResult {
  canceled: boolean;
  summary?: SessionSnapshot;
}

export interface DraftUpdateResult {
  accepted: boolean;
  revision: number;
}

```

- [ ] **Step 4: Implement `ProjectSessionManager`**

Use these exact public contracts and state rules in `src/main/project-session.ts`:

```ts
import type {
  ChecklistTemplateDefinition,
  ProjectDefinition,
  ProjectMode,
  SessionSaveResult,
  SessionSnapshot
} from '../shared/model.js';
import { createProject } from '../shared/defaults.js';
import { validateProject } from '../shared/validation.js';
import { assertProjectDefinition } from '../shared/project-structure.js';
import { UserFacingError } from '../shared/ipc-result.js';
import { DocumentRegistry } from './document-registry.js';
import { ProjectStore } from './project-store.js';
import { CopilotPackageGenerator } from './package-generator.js';

export interface ProjectStorePort {
  openProject(path: string): Promise<ProjectDefinition>;
  saveProject(path: string, project: ProjectDefinition): Promise<void>;
  saveTemplate(
    path: string,
    project: ProjectDefinition,
    existing?: ChecklistTemplateDefinition
  ): Promise<ChecklistTemplateDefinition>;
  openTemplate(path: string): Promise<ChecklistTemplateDefinition>;
}

export interface PackageGeneratorPort {
  generate(path: string, project: ProjectDefinition): Promise<{ packageId: string; fileCount: number }>;
}

export interface SessionResources {
  registry: DocumentRegistry;
  store: ProjectStorePort;
  packageGenerator: PackageGeneratorPort;
}

export interface ProjectSessionContext {
  project: ProjectDefinition;
  path?: string;
  template?: ChecklistTemplateDefinition;
  dirty: boolean;
  revision: number;
  resources: SessionResources;
}

export type SavePathPicker = (defaultName: string) => Promise<string | undefined>;
export type SessionResourcesFactory = () => SessionResources;

export const createSessionResources = (): SessionResources => {
  const registry = new DocumentRegistry();
  return {
    registry,
    store: new ProjectStore(registry),
    packageGenerator: new CopilotPackageGenerator(registry)
  };
};

export class ProjectSessionManager {
  #current?: ProjectSessionContext;
  #operationTail: Promise<void> = Promise.resolve();

  constructor(private readonly createResources: SessionResourcesFactory = createSessionResources) {}

  hasCurrent(): boolean { return this.#current !== undefined; }

  runExclusive<T>(operation: () => T): Promise<Awaited<T>> {
    const result = this.#operationTail.then(operation, operation);
    this.#operationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  requireCurrent(): ProjectSessionContext {
    if (!this.#current) throw new UserFacingError('PROJECT_REQUIRED', 'プロジェクトを新規作成するか開いてください。');
    return this.#current;
  }

  currentSummary(): SessionSnapshot {
    const current = this.requireCurrent();
    return {
      project: structuredClone(current.project),
      dirty: current.dirty,
      revision: current.revision,
      ...(current.path ? { path: current.path } : {})
    };
  }

  createCandidate(mode: ProjectMode): ProjectSessionContext {
    return { project: createProject(mode), dirty: true, revision: 0, resources: this.createResources() };
  }

  async loadCandidate(path: string): Promise<ProjectSessionContext> {
    const resources = this.createResources();
    try {
      const project = await resources.store.openProject(path);
      assertProjectDefinition(project);
      return { project, path, dirty: false, revision: 0, resources };
    } catch (error) {
      throw new UserFacingError(
        'PROJECT_OPEN_FAILED',
        'プロジェクトを開けませんでした。ファイルが破損しているか、対応していない形式です。',
        error
      );
    }
  }

  replaceCurrent(candidate: ProjectSessionContext): SessionSnapshot {
    this.#current = candidate;
    return this.currentSummary();
  }

  updateDraft(project: ProjectDefinition, revision: number): boolean {
    const current = this.requireCurrent();
    if (
      !Number.isSafeInteger(revision) ||
      revision <= current.revision ||
      project.projectId !== current.project.projectId
    ) return false;
    const tokens = [project.target?.token, ...project.references.map((reference) => reference.document.token)]
      .filter((token): token is string => token !== undefined);
    if (tokens.some((token) => !current.resources.registry.has(token))) {
      throw new UserFacingError(
        'PROJECT_DOCUMENT_MISMATCH',
        '選択文書が現在のプロジェクトと一致しません。文書を選択し直してください。'
      );
    }
    current.project = structuredClone(project);
    current.revision = revision;
    current.dirty = true;
    return true;
  }

  applyMainUpdate(update: (project: ProjectDefinition) => ProjectDefinition): SessionSnapshot {
    const current = this.requireCurrent();
    const project = update(structuredClone(current.project));
    if (project.projectId !== current.project.projectId) {
      throw new UserFacingError('PROJECT_MISMATCH', '現在のプロジェクトと更新内容が一致しません。');
    }
    current.project = project;
    current.revision += 1;
    current.dirty = true;
    return this.currentSummary();
  }

  currentTemplate(): ChecklistTemplateDefinition | undefined {
    return this.requireCurrent().template;
  }

  setCurrentTemplate(template: ChecklistTemplateDefinition): void {
    this.requireCurrent().template = template;
  }

  async saveCurrent(saveAs: boolean, pickPath: SavePathPicker): Promise<SessionSaveResult> {
    const current = this.requireCurrent();
    const firstError = validateProject(current.project).find((issue) => issue.severity === 'error');
    if (firstError) throw new UserFacingError('PROJECT_INVALID', `保存できません: ${firstError.message}`);
    const path = saveAs ? await pickPath(current.project.name) : current.path ?? await pickPath(current.project.name);
    if (!path) return { canceled: true, summary: this.currentSummary() };
    const revisionAtStart = current.revision;
    const project = { ...current.project, updatedAt: new Date().toISOString() };
    try {
      await current.resources.store.saveProject(path, project);
    } catch (error) {
      throw new UserFacingError(
        'PROJECT_SAVE_FAILED',
        'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。',
        error
      );
    }
    current.path = path;
    if (current.revision === revisionAtStart) {
      current.project = project;
      current.dirty = false;
      current.revision += 1;
    }
    return { canceled: false, path, project, summary: this.currentSummary() };
  }
}
```

- [ ] **Step 5: Write persisted/live structure regressions and verify RED**

The archive deliberately strips document tokens to `''`, while a live Renderer draft must carry non-empty tokens owned by the active `DocumentRegistry`. Write `tests/project-structure.test.ts` before changing the store or validators. The two contracts must remain distinct:

- Both structural validators reject values that cannot safely be loaded: non-object root, wrong `formatVersion`, missing/non-string identity and date fields, invalid mode/repair-policy discriminants, non-array `references` or checklist collections, malformed selected-document descriptors, malformed generation settings, malformed reference/check-item/condition/scope discriminants, and mode-specific values of the wrong type.
- `assertPersistedProjectDefinition()` requires each persisted document token to be exactly `''`; `assertProjectDefinition()` requires every present target/reference token to be a non-empty string.
- Structural validation does **not** reject a structurally valid but incomplete project such as an `existing_document` project without `target`; those remain editable and appear as normal `validateProject()` issues.
- Every thrown structure error is a fixed `プロジェクトデータの構造が不正です。` error; do not include raw JSON, paths, or object values.

Use a real selected-document descriptor in the token cases:

```ts
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import {
  assertPersistedProjectDefinition,
  assertProjectDefinition,
  assertRecord
} from '../src/shared/project-structure.js';

const selected = {
  token: 'LIVE-TOKEN', originalFileName: 'target.md', storedPath: 'documents/target.md',
  mediaType: 'text/markdown', sizeBytes: 4, sha256: 'a'.repeat(64), format: 'md' as const, editable: true
};

describe('assertProjectDefinition', () => {
  it('accepts a structurally valid project even when business validation has issues', () => {
    expect(() => assertProjectDefinition(createProject('existing_document'))).not.toThrow();
  });

  it('accepts an empty persisted token but requires a non-empty live token', () => {
    const persisted = { ...createProject('existing_document'), target: { ...selected, token: '' } };
    expect(() => assertPersistedProjectDefinition(persisted)).not.toThrow();
    expect(() => assertProjectDefinition(persisted)).toThrow('プロジェクトデータの構造が不正です。');
    expect(() => assertProjectDefinition({ ...persisted, target: selected })).not.toThrow();
  });

  it('narrows only records before metadata is spread', () => {
    expect(() => assertRecord(null)).toThrow('プロジェクトデータの構造が不正です。');
    expect(() => assertRecord({ formatVersion: '1.0' })).not.toThrow();
  });

  it.each([
    null,
    { ...createProject('existing_document'), references: null },
    { ...createProject('document_generation'), generation: { instructions: 42 } },
    {
      ...createProject('existing_document'),
      checklist: { ...createProject('existing_document').checklist, items: [{ conditions: 'bad' }] }
    }
  ])('rejects unsafe project topology', (value) => {
    expect(() => assertProjectDefinition(value)).toThrow('プロジェクトデータの構造が不正です。');
  });
});
```

Before any production change, also append three regressions to `tests/project-session.test.ts`:

1. Save a valid generation Project with a fixed `updatedAt` through a real `ProjectStore` in a unique `mkdtemp()` directory, reopen it with a fresh registry/store, and assert equality with the Project passed to `saveProject()`; this fails while `ProjectStore` mutates the timestamp.
2. Save/reopen an existing-document Project and assert its restored target token is non-empty and owned by the fresh registry.
3. Submit an otherwise structurally valid, newer-revision draft carrying an unknown target/reference token, assert the fixed `PROJECT_DOCUMENT_MISMATCH` message, and assert the Manager snapshot is unchanged.

Remove only the exact test-created temp directory in `afterEach`/`finally`. Run both focused files before production changes:

```powershell
npm.cmd test -- tests/project-structure.test.ts tests/project-session.test.ts
```

Expected: FAIL because the persisted/live assertions and registry ownership API do not exist, and the real store still changes `updatedAt`.

- [ ] **Step 6: Implement structure validation, registry ownership, and single timestamp ownership**

Create `src/shared/project-structure.ts` with these exported assertions:

```ts
export function assertRecord(value: unknown): asserts value is Record<string, unknown> { /* fixed-message check */ }
export function assertPersistedProjectDefinition(value: unknown): asserts value is ProjectDefinition { /* token === '' */ }
export function assertProjectDefinition(value: unknown): asserts value is ProjectDefinition { /* token.length > 0 */ }
```

Use function declarations (or explicitly annotated assertion-function variables), not inferred `const` arrows; otherwise TypeScript raises TS2775 at the narrowing call sites.

Add `DocumentRegistry.has(token: string): boolean` as a `Map.has()`-only ownership check; it must not call `resolve()` or read document bytes on each draft keystroke. `ProjectSessionManager.updateDraft()` uses it for every present target/reference token after the stale/cross-project checks and before changing the active state. Add a manager regression showing that an otherwise valid draft with an unknown token throws the fixed `PROJECT_DOCUMENT_MISMATCH` message and leaves the current snapshot unchanged.

In `ProjectStore.openProject()`, parse both JSON entries as `unknown`. Narrow metadata with `assertRecord(metadata)` **before** spreading it, then validate the persisted candidate before reading any `storedPath`:

```ts
const metadata = parseJson<unknown>(requireEntry(entries, 'project.json'), 'project.json');
const checklist = parseJson<unknown>(requireEntry(entries, 'checklist.json'), 'checklist.json');
assertRecord(metadata);
const persisted: unknown = { ...metadata, checklist };
assertPersistedProjectDefinition(persisted);

const target = persisted.target
  ? this.#restoreDocument(persisted.target, requireEntry(entries, persisted.target.storedPath))
  : undefined;
const references = persisted.references.map((reference) => ({
  ...reference,
  document: this.#restoreDocument(
    reference.document,
    requireEntry(entries, reference.document.storedPath)
  )
}));
const restored = { ...persisted, ...(target ? { target } : {}), references };
assertProjectDefinition(restored);
return restored;
```

Keep the defensive live assertion in `loadCandidate()` after `ProjectStore` returns. The post-restore assertion proves archive documents received live registry tokens before entering the session.

In `ProjectStore.saveProject()`, remove its second timestamp mutation:

```ts
const persisted = cloneWithoutTokens(project);
// use project, not a second { ...project, updatedAt: new Date() } object
```

`ProjectSessionManager.saveCurrent()` is the only project-save timestamp owner, so the returned snapshot and reopened file describe the same saved project.

Make all prewritten structure, timestamp, restored-token, and active-registry ownership regressions green without weakening the fixed-message validation boundary.

- [ ] **Step 7: Run the focused tests, typecheck, and full suite**

```powershell
npm.cmd test -- tests/project-structure.test.ts tests/project-session.test.ts
npm.cmd run typecheck
npm.cmd test
```

Expected: structural and session tests pass, all three TypeScript projects compile, and the full suite has zero failures.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- src/shared/model.ts src/shared/project-structure.ts src/main/document-registry.ts src/main/project-session.ts src/main/project-store.ts tests/project-structure.test.ts tests/project-session.test.ts
git commit -m "feat: add authoritative project session manager"
```

---

### Task 3: Unsaved guard, atomic replacement, clean export, and session controller

**Files:**
- Create: `src/main/session-workflows.ts`
- Create: `src/main/session-controller.ts`
- Test: `tests/session-workflows.test.ts`
- Test: `tests/session-controller.test.ts`

**Interfaces:**
- Consumes: `ProjectSessionManager`, `ProjectSessionContext`, `SavePathPicker`, `SessionChangeResult`, and `UserFacingError`.
- Produces: `UnsavedDecision`, `UnsavedGuardPorts`, `CleanExportPorts`, `guardUnsavedSession()`, `replaceWithCandidate()`, `exportCleanSession()`, and `ProjectSessionController`.

- [ ] **Step 1: Write all failing workflow tests**

Create the initial test file with the code below **and the additional edge cases shown in Step 4** before writing `session-workflows.ts`.

```ts
import { describe, expect, it, vi } from 'vitest';
import { ProjectSessionManager, type SessionResources } from '../src/main/project-session.js';
import { DocumentRegistry } from '../src/main/document-registry.js';
import { guardUnsavedSession, replaceWithCandidate, exportCleanSession } from '../src/main/session-workflows.js';

const resources = (): SessionResources => ({
  registry: new DocumentRegistry(),
  store: {
    openProject: vi.fn(),
    saveProject: vi.fn().mockResolvedValue(undefined),
    saveTemplate: vi.fn(),
    openTemplate: vi.fn()
  },
  packageGenerator: { generate: vi.fn().mockResolvedValue({ packageId: 'PKG-1', fileCount: 5 }) }
});

const readyManager = () => {
  const manager = new ProjectSessionManager(resources);
  const active = manager.createCandidate('document_generation');
  active.project.generation = { ...active.project.generation!, instructions: '本文を作成する' };
  manager.replaceCurrent(active);
  return manager;
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
    const generate = vi.mocked(manager.requireCurrent().resources.packageGenerator.generate);
    await expect(exportCleanSession(manager, {
      pickExportPath: vi.fn().mockResolvedValue('C:\\work\\package.zip')
    })).rejects.toThrow('プロジェクトを保存してからパッケージを作成してください。');
    expect(generate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the workflow test and verify RED**

```powershell
npm.cmd test -- tests/session-workflows.test.ts
```

Expected: FAIL because `session-workflows.ts` does not exist.

- [ ] **Step 3: Implement the workflow functions**

```ts
import type { ExportResult, SessionChangeResult } from '../shared/model.js';
import { UserFacingError } from '../shared/ipc-result.js';
import { validateProject } from '../shared/validation.js';
import type { ProjectSessionContext, ProjectSessionManager, SavePathPicker } from './project-session.js';

export type UnsavedDecision = 'save' | 'discard' | 'cancel';

export interface UnsavedGuardPorts {
  askUnsaved(projectName: string): Promise<UnsavedDecision>;
  pickProjectPath: SavePathPicker;
  showError(message: string): Promise<void> | void;
  reportUnexpected?(error: unknown): void;
}

export interface CleanExportPorts {
  pickExportPath(defaultName: string): Promise<string | undefined>;
}

export const guardUnsavedSession = async (
  manager: ProjectSessionManager,
  ports: UnsavedGuardPorts
): Promise<boolean> => {
  if (!manager.hasCurrent()) return true;
  const current = manager.currentSummary();
  if (!current.dirty) return true;
  const decision = await ports.askUnsaved(current.project.name);
  if (decision === 'cancel') return false;
  if (decision === 'discard') return true;
  try {
    const result = await manager.saveCurrent(false, ports.pickProjectPath);
    if (result.canceled) return false;
    if (result.summary.dirty) {
      await ports.showError('保存中に新しい変更があったため、操作を中止しました。もう一度実行してください。');
      return false;
    }
    return true;
  } catch (error) {
    if (error instanceof UserFacingError) {
      if (error.cause !== undefined) ports.reportUnexpected?.(error.cause);
      await ports.showError(error.message);
      return false;
    }
    throw error;
  }
};

export const replaceWithCandidate = async (
  manager: ProjectSessionManager,
  candidate: ProjectSessionContext,
  ports: UnsavedGuardPorts
): Promise<SessionChangeResult> => {
  if (!(await guardUnsavedSession(manager, ports))) return { canceled: true };
  return { canceled: false, summary: manager.replaceCurrent(candidate) };
};

export const exportCleanSession = async (
  manager: ProjectSessionManager,
  ports: CleanExportPorts
): Promise<ExportResult> => {
  const current = manager.requireCurrent();
  if (current.dirty) {
    throw new UserFacingError('PROJECT_DIRTY', 'プロジェクトを保存してからパッケージを作成してください。');
  }
  const firstError = validateProject(current.project).find((issue) => issue.severity === 'error');
  if (firstError) {
    throw new UserFacingError('PROJECT_INVALID', `パッケージを作成できません: ${firstError.message}`);
  }
  const outputPath = await ports.pickExportPath(current.project.name);
  if (!outputPath) return { canceled: true };
  let generated: { packageId: string; fileCount: number };
  try {
    generated = await current.resources.packageGenerator.generate(outputPath, current.project);
  } catch (error) {
    throw new UserFacingError(
      'PACKAGE_EXPORT_FAILED',
      'パッケージを作成できませんでした。保存先とアクセス権を確認してください。',
      error
    );
  }
  return {
    canceled: false,
    path: outputPath,
    packageId: generated.packageId,
    fileCount: generated.fileCount
  };
};
```

- [ ] **Step 4: Verify the prewritten save-failure and validation branches**

These tests must already have been appended during Step 1 and observed failing before Step 3 production code:

```ts
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

it('blocks export before choosing a destination when validation fails', async () => {
  const manager = new ProjectSessionManager(resources);
  const invalid = manager.createCandidate('existing_document');
  invalid.dirty = false;
  manager.replaceCurrent(invalid);
  const context = manager.requireCurrent();
  const pickExportPath = vi.fn();

  await expect(exportCleanSession(manager, {
    pickExportPath
  })).rejects.toThrow('パッケージを作成できません: 主対象文書がありません。');
  expect(pickExportPath).not.toHaveBeenCalled();
  expect(context.resources.packageGenerator.generate).not.toHaveBeenCalled();
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
  expect(result).toMatchObject({ canceled: false, packageId: 'PKG-1', fileCount: 5 });
  expect(manager.currentSummary()).toEqual(before);
});

it('allows the first project creation without an unsaved prompt', async () => {
  const manager = new ProjectSessionManager(resources);
  const askUnsaved = vi.fn();
  const result = await replaceWithCandidate(manager, manager.createCandidate('document_generation'), {
    askUnsaved,
    pickProjectPath: vi.fn(),
    showError: vi.fn()
  });
  expect(result.canceled).toBe(false);
  expect(askUnsaved).not.toHaveBeenCalled();
});

it('replaces an existing clean project without an unsaved prompt', async () => {
  const manager = readyManager();
  manager.requireCurrent().dirty = false;
  const askUnsaved = vi.fn();
  const result = await replaceWithCandidate(manager, manager.createCandidate('existing_document'), {
    askUnsaved,
    pickProjectPath: vi.fn(),
    showError: vi.fn()
  });
  expect(result.canceled).toBe(false);
  expect(result.summary?.project.mode).toBe('existing_document');
  expect(askUnsaved).not.toHaveBeenCalled();
});
```

- [ ] **Step 5: Write session-controller integration tests and verify RED**

Write `tests/session-controller.test.ts` before production code. Cover these integration seams with injected ports and deferred promises:

- first `newProject()` does not prompt;
- dirty `newProject()` and `openProject()` both use the same save/discard/cancel guard;
- `openProject()` fully loads a candidate before asking about the active dirty session, and cancel keeps the old project/path/resource object;
- a rejected candidate load leaves the old registry able to resolve its registered token and leaves old save/export ports usable;
- `updateDraft()` rejects malformed, stale, cross-project, empty-token, and active-registry-unknown-token payloads without mutating the Manager;
- queued draft synchronization completes before a following `save()` reads the project;
- `export()` rejects dirty state and generates only from a valid clean project.

```powershell
npm.cmd test -- tests/session-controller.test.ts
```

Expected: FAIL because `src/main/session-controller.ts` does not exist.

- [ ] **Step 6: Add the Electron-independent session controller**

Create `src/main/session-controller.ts`. Every handler that reads or mutates the session will call this controller or `manager.runExclusive()`; do not access the Manager concurrently from `main.ts`.

```ts
import type {
  DraftUpdateResult,
  ExportResult,
  ProjectDefinition,
  ProjectMode,
  SessionChangeResult,
  SessionSaveResult,
  ValidationIssue
} from '../shared/model.js';
import { assertProjectDefinition } from '../shared/project-structure.js';
import { UserFacingError } from '../shared/ipc-result.js';
import { validateProject } from '../shared/validation.js';
import type { ProjectSessionManager } from './project-session.js';
import {
  exportCleanSession,
  replaceWithCandidate,
  type CleanExportPorts,
  type UnsavedGuardPorts
} from './session-workflows.js';

export interface SessionControllerPorts extends UnsavedGuardPorts, CleanExportPorts {
  pickOpenProject(): Promise<string | undefined>;
}

export class ProjectSessionController {
  constructor(
    readonly manager: ProjectSessionManager,
    private readonly ports: SessionControllerPorts
  ) {}

  newProject(mode: ProjectMode): Promise<SessionChangeResult> {
    return this.manager.runExclusive(() =>
      replaceWithCandidate(this.manager, this.manager.createCandidate(mode), this.ports)
    );
  }

  openProject(): Promise<SessionChangeResult> {
    return this.manager.runExclusive(async () => {
      const path = await this.ports.pickOpenProject();
      if (!path) return { canceled: true };
      const candidate = await this.manager.loadCandidate(path);
      return replaceWithCandidate(this.manager, candidate, this.ports);
    });
  }

  updateDraft(value: unknown, revision: number): Promise<DraftUpdateResult> {
    return this.manager.runExclusive(() => {
      try {
        assertProjectDefinition(value);
      } catch (error) {
        throw new UserFacingError('PROJECT_INVALID', 'プロジェクトデータが不正です。', error);
      }
      const accepted = this.manager.updateDraft(value as ProjectDefinition, revision);
      return { accepted, revision: this.manager.currentSummary().revision };
    });
  }

  save(saveAs: boolean): Promise<SessionSaveResult> {
    return this.manager.runExclusive(() => this.manager.saveCurrent(saveAs, this.ports.pickProjectPath));
  }

  validate(): Promise<ValidationIssue[]> {
    return this.manager.runExclusive(() => validateProject(this.manager.requireCurrent().project));
  }

  export(): Promise<ExportResult> {
    return this.manager.runExclusive(() => exportCleanSession(this.manager, this.ports));
  }
}
```

Run the prewritten tests after implementation and confirm all rejection cases leave `manager.currentSummary()` unchanged.

- [ ] **Step 7: Run focused tests, typecheck, and full suite**

```powershell
npm.cmd test -- tests/session-workflows.test.ts tests/session-controller.test.ts
npm.cmd run typecheck
npm.cmd test
```

Expected: all workflow branches pass with no existing regression.

- [ ] **Step 8: Commit Task 3**

```powershell
git add -- src/main/session-workflows.ts src/main/session-controller.ts tests/session-workflows.test.ts tests/session-controller.test.ts
git commit -m "fix: guard project replacement and clean export"
```

---

### Task 4: Safe close state machine and native dialog mapping

**Files:**
- Create: `src/main/close-coordinator.ts`
- Create: `src/main/session-dialogs.ts`
- Test: `tests/close-coordinator.test.ts`
- Test: `tests/session-dialogs.test.ts`

**Interfaces:**
- Consumes: no Electron runtime; request IDs, injected timing, and plain dialog option data only.
- Produces: a `flushing -> guarding -> approved/canceled` `CloseCoordinator`, `coordinateClose()`, `unsavedDialogOptions()`, and `decisionForDialogResponse()`.

- [ ] **Step 1: Write failing close-coordinator tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloseCoordinator, coordinateClose } from '../src/main/close-coordinator.js';

afterEach(() => vi.useRealTimers());

describe('CloseCoordinator', () => {
  it('resolves only a matching flush acknowledgement', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-1');
    const send = vi.fn();
    const pending = coordinator.requestFlush(send, 5000);
    coordinator.acknowledge('OTHER');
    expect(coordinator.isGuarding).toBe(true);
    coordinator.acknowledge('REQ-1');
    await expect(pending).resolves.toBe(true);
    expect(send).toHaveBeenCalledWith('REQ-1');
  });

  it('times out without allowing close', async () => {
    vi.useFakeTimers();
    const coordinator = new CloseCoordinator(() => 'REQ-2');
    const pending = coordinator.requestFlush(vi.fn(), 5000);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBe(false);
    expect(coordinator.closeApproved).toBe(false);
  });

  it('deduplicates concurrent close requests', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-3');
    const send = vi.fn();
    const first = coordinator.requestFlush(send, 5000);
    const second = coordinator.requestFlush(send, 5000);
    coordinator.acknowledge('REQ-3');
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    expect(send).toHaveBeenCalledOnce();
  });

  it('stays guarded after flush acknowledgement while the unsaved decision is pending', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-4');
    let finishDecision!: (value: boolean) => void;
    const decision = new Promise<boolean>((resolve) => { finishDecision = resolve; });
    const send = vi.fn();
    const closing = coordinateClose(coordinator, send, () => decision, 5000);
    coordinator.acknowledge('REQ-4');
    await Promise.resolve();

    expect(coordinator.isGuarding).toBe(true);
    await expect(coordinator.requestFlush(send, 5000)).resolves.toBe(false);
    finishDecision(false);
    await expect(closing).resolves.toBe('canceled');
    expect(coordinator.isGuarding).toBe(false);
  });

  it('approves close only after flush and the shared guard both succeed', async () => {
    const coordinator = new CloseCoordinator(() => 'REQ-5');
    const closing = coordinateClose(coordinator, vi.fn(), vi.fn().mockResolvedValue(true), 5000);
    coordinator.acknowledge('REQ-5');
    await expect(closing).resolves.toBe('approved');
    expect(coordinator.closeApproved).toBe(true);
  });

  it('returns to idle when sending the flush request throws', async () => {
    let request = 5;
    const coordinator = new CloseCoordinator(() => `REQ-${++request}`);
    await expect(coordinator.requestFlush(() => { throw new Error('window destroyed'); }, 5000))
      .rejects.toThrow('window destroyed');
    expect(coordinator.isGuarding).toBe(false);

    const retry = coordinator.requestFlush(vi.fn(), 5000);
    coordinator.acknowledge('REQ-7');
    await expect(retry).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

```powershell
npm.cmd test -- tests/close-coordinator.test.ts
```

Expected: FAIL because `CloseCoordinator` does not exist.

- [ ] **Step 3: Implement the coordinator**

```ts
export class CloseCoordinator {
  #pending?: { id: string; resolve: (value: boolean) => void; timer: ReturnType<typeof setTimeout> };
  #state: 'idle' | 'flushing' | 'guarding' | 'approved' = 'idle';

  constructor(private readonly createRequestId: () => string) {}

  get isGuarding(): boolean { return this.#state === 'flushing' || this.#state === 'guarding'; }
  get closeApproved(): boolean { return this.#state === 'approved'; }

  requestFlush(send: (requestId: string) => void, timeoutMs: number): Promise<boolean> {
    if (this.#state !== 'idle') return Promise.resolve(false);
    const id = this.createRequestId();
    this.#state = 'flushing';
    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending = undefined;
        this.#state = 'idle';
        resolve(false);
      }, timeoutMs);
      this.#pending = { id, resolve, timer };
      try {
        send(id);
      } catch (error) {
        clearTimeout(timer);
        this.#pending = undefined;
        this.#state = 'idle';
        reject(error);
      }
    });
  }

  acknowledge(requestId: string): void {
    if (!this.#pending || this.#pending.id !== requestId) return;
    const pending = this.#pending;
    this.#pending = undefined;
    clearTimeout(pending.timer);
    this.#state = 'guarding';
    pending.resolve(true);
  }

  approveClose(): void {
    if (this.#state === 'guarding') this.#state = 'approved';
  }

  cancelClose(): void {
    if (this.#state === 'guarding') this.#state = 'idle';
  }

  abortClose(): void {
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.#state = 'idle';
  }
}

export type CloseOutcome = 'approved' | 'canceled' | 'flush-timeout';

export const coordinateClose = async (
  coordinator: CloseCoordinator,
  sendFlush: (requestId: string) => void,
  guardUnsaved: () => Promise<boolean>,
  timeoutMs: number
): Promise<CloseOutcome> => {
  try {
    if (!(await coordinator.requestFlush(sendFlush, timeoutMs))) return 'flush-timeout';
    if (!(await guardUnsaved())) {
      coordinator.cancelClose();
      return 'canceled';
    }
    coordinator.approveClose();
    return 'approved';
  } catch (error) {
    coordinator.abortClose();
    throw error;
  }
};
```

- [ ] **Step 4: Write native-dialog mapping tests and verify RED**

Write `tests/session-dialogs.test.ts` first, asserting exact Japanese labels, order, `defaultId: 2`, `cancelId: 2`, `noLink: true`, and response mapping `0 -> save`, `1 -> discard`, every other response -> `cancel`.

```powershell
npm.cmd test -- tests/session-dialogs.test.ts
```

Expected: FAIL because `src/main/session-dialogs.ts` does not exist.

- [ ] **Step 5: Implement pure native-dialog mapping**

Create `src/main/session-dialogs.ts` without importing Electron at runtime:

```ts
import type { UnsavedDecision } from './session-workflows.js';

export const CLOSE_FLUSH_TIMEOUT_MESSAGE =
  '最新の編集内容を確認できないため、終了を中止しました。もう一度お試しください。';

export const unsavedDialogOptions = (projectName: string) => ({
  type: 'warning' as const,
  title: '未保存の変更があります',
  message: `${projectName}には未保存の変更があります。`,
  detail: '保存してから続行するか、変更を破棄するか選択してください。',
  buttons: ['保存して続行', '保存せずに続行', 'キャンセル'],
  defaultId: 2,
  cancelId: 2,
  noLink: true
});

export const decisionForDialogResponse = (response: number): UnsavedDecision =>
  response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel';
```

Main will spread this plain object into `dialog.showMessageBox()`; tests do not launch Electron.

- [ ] **Step 6: Run focused tests, typecheck, and full suite**

```powershell
npm.cmd test -- tests/close-coordinator.test.ts tests/session-dialogs.test.ts
npm.cmd run typecheck
npm.cmd test
```

- [ ] **Step 7: Commit Task 4**

```powershell
git add -- src/main/close-coordinator.ts src/main/session-dialogs.ts tests/close-coordinator.test.ts tests/session-dialogs.test.ts
git commit -m "fix: coordinate safe Electron window close"
```

---

### Task 5: Atomic Electron contract migration (one agent only)

#### Phase A: Main IPC and sandbox-safe Preload contract

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/shared/model.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/main/main.ts`
- Test: `tests/preload.test.ts`
- Create: `src/main/session-handlers.ts`
- Test: `tests/session-handlers.test.ts`

**Interfaces:**
- Consumes: all Tasks 1–4 interfaces.
- Produces: updated `AppBridge`, draft-sync IPC, close-flush/cancel subscriptions and acknowledgement, typed event-aware Main handler registration.

Phases A and B are one atomic contract migration and must be assigned to the same implementer. Do not commit or hand off between phases: Main/Preload return signatures intentionally change before App is migrated in Phase B. Phase A may compile only its independent Main and Preload TypeScript projects.

- [ ] **Step 1: Write the failing Preload bridge test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { IPC } from '../src/shared/ipc.js';
import { createBridge, PRELOAD_IPC } from '../src/preload/preload.js';
import { ipcSuccess } from '../src/shared/ipc-result.js';

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
  });

  it('shows only a typed user message and genericizes a malformed envelope', async () => {
    const userFailure = createBridge({
      invoke: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: 'PROJECT_INVALID', message: '保存できません: 入力を確認してください。' }
      }),
      on: vi.fn(),
      removeListener: vi.fn()
    });
    await expect(userFailure.saveProject()).rejects.toThrow('保存できません: 入力を確認してください。');

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
```

Also write `tests/session-handlers.test.ts` against a wished-for `createSessionHandlers()` factory. Inject mocked `ProjectSessionController`, `ProjectSessionManager`, active-registry/document-picker functions, and `acknowledgeClose(senderId, requestId)`. Assert:

- `newProject`, `openProject`, `saveProject`, `validateProject`, and `exportPackage` delegate to the controller and preserve returned snapshots/results;
- invalid mode, revision, `saveAs`, or request ID never reaches the controller; malformed project topology reaches `controller.updateDraft()` but never reaches `manager.updateDraft()`;
- target and reference selection execute through `manager.runExclusive()` and use the active context registry;
- template save/open use only the active context project/store/template;
- `closeReady` acknowledges only the sender's coordinator;
- the handler map contains every session invoke channel exactly once; Main registers that map plus the direct versions/shell handlers only through the single `handle()` wrapper around `runIpcOperation()`.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm.cmd test -- tests/preload.test.ts tests/session-handlers.test.ts
```

Expected: FAIL because the new channels, exported `createBridge()`, and `session-handlers.ts` do not exist.

- [ ] **Step 3: Extend IPC and bridge contracts**

Add channels:

```ts
updateProject: 'project:update-draft',
flushBeforeClose: 'session:flush-before-close',
closeReady: 'session:close-ready',
closeCanceled: 'session:close-canceled'
```

Use the `Session*` and `DraftUpdateResult` contracts added in Task 2, remove the now-obsolete `OpenResult`, and atomically replace `AppBridge` with:

```ts
export interface AppBridge {
  newProject(mode: ProjectMode): Promise<SessionChangeResult>;
  openProject(): Promise<SessionChangeResult>;
  updateProject(project: ProjectDefinition, revision: number): Promise<DraftUpdateResult>;
  saveProject(saveAs?: boolean): Promise<SessionSaveResult>;
  selectTarget(): Promise<SessionSnapshot | null>;
  selectReferences(): Promise<SelectedDocument[]>;
  exportPackage(): Promise<ExportResult>;
  validateProject(): Promise<ValidationIssue[]>;
  onFlushBeforeClose(listener: (requestId: string) => void): () => void;
  onCloseCanceled(listener: (requestId: string) => void): () => void;
  closeReady(requestId: string): Promise<void>;
  saveTemplate(): Promise<SaveResult>;
  openTemplate(): Promise<ChecklistTemplateDefinition | null>;
  openFolder(path: string): Promise<void>;
  getVersions(): Promise<{ application: string; electron: string; node: string; chrome: string }>;
}
```

- [ ] **Step 4: Implement `createBridge()` and expose it from Preload**

`tsconfig.preload.json` deliberately limits `rootDir` to `src/preload`, so keep the runtime envelope structural and the channel constants local to the preload build. `tests/preload.test.ts` locks those values to `src/shared/ipc.ts`.

Keep all of the following in `src/preload/preload.ts`. With `sandbox: true`, Electron's restricted preload `require()` cannot load another local CommonJS file, so do not create `bridge.ts` and do not call `require('./bridge.js')`.

```ts
export const PRELOAD_IPC = {
  newProject: 'project:new',
  openProject: 'project:open',
  updateProject: 'project:update-draft',
  saveProject: 'project:save',
  selectTarget: 'document:select-target',
  selectReferences: 'document:select-references',
  exportPackage: 'package:export',
  validateProject: 'project:validate',
  saveTemplate: 'template:save',
  openTemplate: 'template:open',
  openFolder: 'shell:show-item',
  versions: 'app:versions',
  flushBeforeClose: 'session:flush-before-close',
  closeReady: 'session:close-ready',
  closeCanceled: 'session:close-canceled'
} as const;

type RuntimeIpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export interface PreloadIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

const invokeSafely = async <T>(ipc: PreloadIpc, channel: string, ...args: unknown[]): Promise<T> => {
  let result: unknown;
  try {
    result = await ipc.invoke(channel, ...args);
  } catch {
    throw new Error('処理に失敗しました。再度お試しください。');
  }
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error('処理に失敗しました。再度お試しください。');
  }
  const envelope = result as RuntimeIpcResult<T>;
  if (envelope.ok === true && 'value' in envelope) return envelope.value;
  if (
    envelope.ok === false &&
    envelope.error &&
    typeof envelope.error.code === 'string' &&
    typeof envelope.error.message === 'string'
  ) {
    throw new Error(envelope.error.message);
  }
  throw new Error('処理に失敗しました。再度お試しください。');
};

export const createBridge = (ipc: PreloadIpc) => ({
  newProject: (mode: 'existing_document' | 'document_generation') =>
    invokeSafely(ipc, PRELOAD_IPC.newProject, mode),
  openProject: () => invokeSafely(ipc, PRELOAD_IPC.openProject),
  updateProject: (project: unknown, revision: number) =>
    invokeSafely(ipc, PRELOAD_IPC.updateProject, project, revision),
  saveProject: (saveAs = false) => invokeSafely(ipc, PRELOAD_IPC.saveProject, saveAs),
  selectTarget: () => invokeSafely(ipc, PRELOAD_IPC.selectTarget),
  selectReferences: () => invokeSafely(ipc, PRELOAD_IPC.selectReferences),
  exportPackage: () => invokeSafely(ipc, PRELOAD_IPC.exportPackage),
  validateProject: () => invokeSafely(ipc, PRELOAD_IPC.validateProject),
  saveTemplate: () => invokeSafely(ipc, PRELOAD_IPC.saveTemplate),
  openTemplate: () => invokeSafely(ipc, PRELOAD_IPC.openTemplate),
  openFolder: (path: string) => invokeSafely(ipc, PRELOAD_IPC.openFolder, path),
  getVersions: () => invokeSafely(ipc, PRELOAD_IPC.versions),
  closeReady: (requestId: string) => invokeSafely(ipc, PRELOAD_IPC.closeReady, requestId),
  onFlushBeforeClose: (listener: (requestId: string) => void) => {
    const registered = (_event: unknown, requestId: unknown): void => {
      if (typeof requestId === 'string') listener(requestId);
    };
    ipc.on(PRELOAD_IPC.flushBeforeClose, registered);
    return () => ipc.removeListener(PRELOAD_IPC.flushBeforeClose, registered);
  },
  onCloseCanceled: (listener: (requestId: string) => void) => {
    const registered = (_event: unknown, requestId: unknown): void => {
      if (typeof requestId === 'string') listener(requestId);
    };
    ipc.on(PRELOAD_IPC.closeCanceled, registered);
    return () => ipc.removeListener(PRELOAD_IPC.closeCanceled, registered);
  }
});
```

At the bottom of the same file, install the bridge only in the Electron preload process. The guard keeps Vitest imports side-effect free, and explicit wrapper functions avoid Electron listener-parameter variance errors:

```ts
if ((process as NodeJS.Process & { type?: string }).type === 'renderer') {
  const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');
  contextBridge.exposeInMainWorld('checklistMaker', createBridge({
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => { ipcRenderer.on(channel, listener); },
    removeListener: (channel, listener) => { ipcRenderer.removeListener(channel, listener); }
  }));
}
```

- [ ] **Step 5: Replace Main globals with `ProjectSessionManager` and typed handler registration**

Implement the tested `createSessionHandlers()` in `src/main/session-handlers.ts`. It accepts a plain `{ senderId }` context plus an injected `controllerFor(senderId)` factory and owns the runtime argument checks/delegation listed above. `main.ts` resolves `BrowserWindow.fromWebContents(event.sender)`, builds owner-bound dialog ports/controller for that sender, and otherwise remains a thin adapter from `IpcMainInvokeEvent` to the pure handler context.

All runtime argument failures use one fixed `UserFacingError('INVALID_ARGUMENT', '入力データが不正です。')`; never interpolate the supplied value.

In `main.ts`, import `type IpcMainInvokeEvent` from Electron, add an event-aware helper, and use it for every `ipcMain.handle`. The event is required to resolve the owning `BrowserWindow` and the correct per-window close coordinator:

```ts
const handle = <TArgs extends unknown[], TResult>(
  channel: string,
  operation: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult
): void => {
  ipcMain.handle(channel, (event, ...rawArgs: unknown[]) =>
    runIpcOperation(
      () => operation(event, ...(rawArgs as TArgs)),
      (error) => console.error(error)
    )
  );
};
```

Instantiate one `ProjectSessionManager`; create short-lived `ProjectSessionController` instances over that same manager with ports bound to the event owner's window using `unsavedDialogOptions()` and `decisionForDialogResponse()`. Supply `reportUnexpected: console.error` so a guarded save failure logs its hidden cause. Route operations as follows:

- `project:new`: validate the unknown mode at runtime, then call `controller.newProject(mode)`.
- `project:open`: call `controller.openProject()`; its injected picker, candidate loading, guard, and atomic swap are one exclusive operation.
- `project:update-draft`: require a positive safe-integer revision, call `controller.updateDraft(rawProject, revision)`, and return its accepted flag/current revision.
- `project:save`: require a boolean `saveAs`, then call `controller.save(saveAs)`.
- `document:select-target`: inside `manager.runExclusive()`, show the picker, register with `manager.requireCurrent().resources.registry`, and call `applyMainUpdate()` to return a `SessionSnapshot`.
- `document:select-references`: inside the same exclusive boundary, register every selected file with the active context registry; never use an application-global registry.
- `project:validate`: call `controller.validate()` with no Renderer project argument.
- `package:export`: call `controller.export()`; it refuses dirty state. Only after success, calculate size and add the exact output path to `allowedOutputPaths`. Export failure never changes the session snapshot.
- `template:save`: use `manager.requireCurrent().project`, the active context store, and `manager.currentTemplate()`; on success call `setCurrentTemplate()`.
- `template:open`: use the active context store and call `setCurrentTemplate()` before returning the template.
- `shell:show-item`: keep the exact `allowedOutputPaths` membership check and require a string path.
- `session:close-ready`: require a string request ID and acknowledge only `closeCoordinators.get(event.sender.id)`.
- Expected archive, registry, store, and package failures become fixed-message `UserFacingError` values with the original error as `cause`; unexpected failures remain generic through `runIpcOperation()`.

Do not keep `registry`, `store`, `packageGenerator`, `currentProjectPath`, or `currentTemplate` globals. Keep only application-wide `allowedOutputPaths` and the `Map<number, CloseCoordinator>` keyed by `webContents.id`.

- [ ] **Step 6: Wire safe window close**

Create one `CloseCoordinator` per `BrowserWindow`, store it under that window's `webContents.id`, and delete it on `closed`. On `BrowserWindow` close:

1. Allow immediately when `closeCoordinator.closeApproved` is true.
2. Otherwise `preventDefault()` and ignore when `coordinator.isGuarding` is already true; this remains true through the native unsaved/save dialogs.
3. Call `coordinateClose()`, sending `IPC.flushBeforeClose` with its request ID.
4. The event-aware `IPC.closeReady` handler acknowledges only the sender's matching coordinator.
5. After acknowledgement, call `manager.runExclusive(() => guardUnsavedSession(manager, ownerBoundPorts))`.
6. On `approved`, call `window.close()`; the coordinator's approved state allows the re-entered close event.
7. On `canceled`, send `IPC.closeCanceled` with the request ID so Renderer releases its operation barrier and keep the window open.
8. On `flush-timeout`, send the same cancellation event, show `CLOSE_FLUSH_TIMEOUT_MESSAGE`, and keep the window open.
9. If close coordination throws, call `coordinator.abortClose()`, send cancellation, log the cause, and show only the generic user message.

Capture the request ID in the `sendFlush` callback before `webContents.send()` so the canceled/timeout branches can echo that exact ID; never generate a second ID for cancellation.

- [ ] **Step 7: Run only the new adapter-focused tests**

```powershell
npm.cmd test -- tests/preload.test.ts tests/session-handlers.test.ts
npx.cmd tsc -p tsconfig.main.json --noEmit
npx.cmd tsc -p tsconfig.preload.json --noEmit
```

Expected: both focused suites pass and the independently compilable Main/Preload projects typecheck. The shared `AppBridge` has changed while `App.tsx` still uses the old API, so do not run the full repository typecheck until Phase B completes the atomic migration.

- [ ] **Step 8: Do not commit; continue immediately with Phase B**

Keep these files unstaged and proceed directly to Phase B with the same implementer. They are committed together only after Main, Preload, Renderer, and the shared contract all typecheck as one unit.

---

#### Phase B: Renderer synchronization, operation barrier, and atomic contract completion

**Files:**
- Create: `src/renderer/draft-synchronizer.ts`
- Create: `src/renderer/session-operation-queue.ts`
- Create: `src/renderer/session-actions.ts`
- Modify: `src/renderer/App.tsx`
- Test: `tests/draft-synchronizer.test.ts`
- Test: `tests/session-operation-queue.test.ts`
- Test: `tests/session-actions.test.ts`
- Modify: `tests/generation-settings-form.test.ts`

**Interfaces:**
- Consumes: updated `AppBridge`, `SessionSnapshot.revision`, and close flush/cancel events from Phase A.
- Produces: `DraftSynchronizer.enqueue()`, `flush()`, `reset()`, `applyDraftEdit()`, `SessionOperationQueue`, `saveThenExport()`, and App handlers that flush before every Main-owned session action.

- [ ] **Step 1: Write failing synchronizer tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import { DraftSynchronizer, applyDraftEdit } from '../src/renderer/draft-synchronizer.js';

describe('DraftSynchronizer', () => {
  it('assigns ordered revisions and flushes the latest update', async () => {
    const sent: number[] = [];
    const send = vi.fn(async (_project, revision: number) => {
      sent.push(revision);
      return { accepted: true, revision };
    });
    const synchronizer = new DraftSynchronizer(send, 3);
    const project = createProject('document_generation');

    expect(synchronizer.enqueue(project)).toBe(4);
    expect(synchronizer.enqueue({ ...project, name: '更新' })).toBe(5);
    await synchronizer.flush();
    expect(sent).toEqual([4, 5]);
  });

  it('resets revision after a Main session replacement', async () => {
    const send = vi.fn().mockImplementation(async (_project, revision: number) => ({ accepted: true, revision }));
    const synchronizer = new DraftSynchronizer(send, 7);
    synchronizer.reset(0);
    expect(synchronizer.enqueue(createProject('existing_document'))).toBe(1);
    await synchronizer.flush();
  });

  it('continues with a later update after an earlier sync rejection', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('sync failed'))
      .mockResolvedValueOnce({ accepted: true, revision: 2 });
    const synchronizer = new DraftSynchronizer(send, 0);
    const project = createProject('document_generation');
    synchronizer.enqueue(project);
    synchronizer.enqueue({ ...project, name: '再同期' });
    await expect(synchronizer.flush()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('rejects flush when Main refuses the newest revision', async () => {
    const send = vi.fn().mockResolvedValue({ accepted: false, revision: 8 });
    const synchronizer = new DraftSynchronizer(send, 8);
    synchronizer.enqueue(createProject('document_generation'));
    await expect(synchronizer.flush()).rejects.toThrow(
      '最新の編集内容を同期できませんでした。操作を中止しました。'
    );
  });

  it('preserves consecutive edits to different fields without a React rerender', () => {
    let snapshot = { project: createProject('document_generation'), dirty: false, revision: 0 };
    const enqueue = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
    snapshot = applyDraftEdit(snapshot, (current) => ({ ...current, name: '更新名' }), enqueue);
    snapshot = applyDraftEdit(snapshot, (current) => ({
      ...current,
      generation: { ...current.generation!, instructions: '最新の生成指示' }
    }), enqueue);

    expect(snapshot.project.name).toBe('更新名');
    expect(snapshot.project.generation?.instructions).toBe('最新の生成指示');
    expect(snapshot.revision).toBe(2);
  });

  it('does not enqueue a draft while a session operation barrier is active', () => {
    const snapshot = { project: createProject('document_generation'), dirty: false, revision: 0 };
    const enqueue = vi.fn();
    expect(applyDraftEdit(snapshot, (current) => ({ ...current, name: '拒否' }), enqueue, true))
      .toBe(snapshot);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm.cmd test -- tests/draft-synchronizer.test.ts
```

Expected: FAIL because `DraftSynchronizer` does not exist.

- [ ] **Step 3: Implement the ordered queue**

```ts
import type { DraftUpdateResult, ProjectDefinition, SessionSnapshot } from '../shared/model.js';

export type SendDraft = (project: ProjectDefinition, revision: number) => Promise<DraftUpdateResult>;

export class DraftSynchronizer {
  #revision: number;
  #pending: Promise<void> = Promise.resolve();

  constructor(private readonly send: SendDraft, revision: number) {
    this.#revision = revision;
  }

  enqueue(project: ProjectDefinition): number {
    const revision = ++this.#revision;
    const run = async (): Promise<void> => {
      const result = await this.send(project, revision);
      if (!result.accepted) {
        throw new Error('最新の編集内容を同期できませんでした。操作を中止しました。');
      }
    };
    this.#pending = this.#pending.then(run, run);
    return revision;
  }

  flush(): Promise<void> { return this.#pending; }

  reset(revision: number): void {
    this.#revision = revision;
    this.#pending = Promise.resolve();
  }
}

export const applyDraftEdit = (
  current: SessionSnapshot,
  update: (project: ProjectDefinition) => ProjectDefinition,
  enqueue: (project: ProjectDefinition) => number,
  blocked = false
): SessionSnapshot => {
  if (blocked) return current;
  const project = update(structuredClone(current.project));
  if (project.projectId !== current.project.projectId) {
    throw new Error('現在のプロジェクトと編集内容が一致しません。');
  }
  return { ...current, project, dirty: true, revision: enqueue(project) };
};
```

- [ ] **Step 4: Write the Renderer operation-barrier tests and verify RED**

Create `tests/session-operation-queue.test.ts` first. Use deferred promises and a blocked-state listener to prove all of these contracts:

- two concurrent `run()` calls execute serially and keep `blocked === true` until both own tokens are released;
- rejection of the first operation does not poison the settled tail, so the second operation still runs;
- `beginClose(requestId, flush)` waits for an already-running operation, runs the close flush once, rejects later normal operations while close is pending, and keeps its dedicated token until `cancelClose(requestId)`;
- canceling one request does not release another token, duplicate cancel is harmless, and `dispose()` silently clears test-owned/unmount state;
- blocked-state notifications occur only on `0 -> 1` and `1 -> 0` transitions.

```powershell
npm.cmd test -- tests/session-operation-queue.test.ts
```

Expected: FAIL because `src/renderer/session-operation-queue.ts` does not exist.

- [ ] **Step 5: Implement the testable operation/close queue**

Create `src/renderer/session-operation-queue.ts`. Use a settled serial tail and idempotent per-token release callbacks; do not reimplement this state in `App.tsx`:

```ts
const CLOSE_PENDING_MESSAGE = '終了確認中のため、新しい操作を開始できません。';

export class SessionOperationQueue {
  #tail: Promise<void> = Promise.resolve();
  #tokens = new Set<symbol>();
  #closes = new Map<string, { release: () => void; task: Promise<void> }>();

  constructor(private onBlockedChange: (blocked: boolean) => void = () => undefined) {}

  get blocked(): boolean { return this.#tokens.size > 0; }

  #acquire(): () => void {
    const token = Symbol('session-operation');
    const notify = this.#tokens.size === 0;
    this.#tokens.add(token);
    if (notify) this.onBlockedChange(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (!this.#tokens.delete(token)) return;
      if (this.#tokens.size === 0) this.onBlockedChange(false);
    };
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closes.size > 0) return Promise.reject(new Error(CLOSE_PENDING_MESSAGE));
    const release = this.#acquire();
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result.finally(release);
  }

  beginClose(requestId: string, flush: () => Promise<void>): Promise<void> {
    const existing = this.#closes.get(requestId);
    if (existing) return existing.task;
    if (this.#closes.size > 0) return Promise.reject(new Error(CLOSE_PENDING_MESSAGE));
    const release = this.#acquire();
    const task = this.#tail.then(flush, flush);
    this.#tail = task.then(() => undefined, () => undefined);
    this.#closes.set(requestId, { release, task });
    return task;
  }

  cancelClose(requestId: string): void {
    const close = this.#closes.get(requestId);
    if (!close) return;
    this.#closes.delete(requestId);
    close.release();
  }

  dispose(): void {
    this.#closes.clear();
    this.#tokens.clear();
    this.onBlockedChange = () => undefined;
  }
}
```

- [ ] **Step 6: Write save-then-export tests and verify RED**

Write `tests/session-actions.test.ts` first. Use a dirty `SessionSnapshot`, a clean returned `SessionSaveResult`, an `adoptSummary` spy, and ordered call markers. Cover:

- save cancel adopts the returned dirty snapshot and never calls export;
- save success applies the clean/revision-advanced snapshot **before** calling export;
- ZIP destination cancel still leaves the adopted UI snapshot clean;
- export rejection after save still leaves the save snapshot adopted, so the next edit starts at the new revision;
- an already-clean snapshot calls export directly.

```powershell
npm.cmd test -- tests/session-actions.test.ts
```

Expected: FAIL because `src/renderer/session-actions.ts` does not exist.

- [ ] **Step 7: Implement save-then-export as two explicit IPC stages**

Create `src/renderer/session-actions.ts`:

```ts
import type { AppBridge, ExportResult, SessionSnapshot } from '../shared/model.js';

type ExportBridge = Pick<AppBridge, 'saveProject' | 'exportPackage'>;

export const saveThenExport = async (
  snapshot: SessionSnapshot,
  bridge: ExportBridge,
  adoptSummary: (summary: SessionSnapshot) => void
): Promise<ExportResult> => {
  if (snapshot.dirty) {
    const saved = await bridge.saveProject(false);
    adoptSummary(saved.summary);
    if (saved.canceled) return { canceled: true };
    if (saved.summary.dirty) {
      throw new Error('保存中に新しい変更があったため、パッケージ作成を中止しました。');
    }
  }
  return bridge.exportPackage();
};
```

This split is intentional: `exportPackage()` never mutates session dirty/revision state, so an export/stat failure cannot strand Renderer on an old revision.

- [ ] **Step 8: Refactor App edits through the tested helper and operation queue**

In `App.tsx`, change state to `SessionSnapshot | null` and keep the same value in `summaryRef`. Construct one `DraftSynchronizer` in a ref using `window.checklistMaker.updateProject`, and one `SessionOperationQueue` whose blocked-state callback owns `busy`.

Use these rules for the helpers:

```ts
const adoptSummary = (next: SessionSnapshot): void => {
  synchronizerRef.current!.reset(next.revision);
  summaryRef.current = next;
  setSummary(next);
};

const commitProject = (update: (project: ProjectDefinition) => ProjectDefinition): void => {
  const current = summaryRef.current;
  if (!current) return;
  const next = applyDraftEdit(
    current,
    update,
    (project) => synchronizerRef.current!.enqueue(project),
    operationQueue.blocked
  );
  if (next === current) return;
  summaryRef.current = next;
  setSummary(next);
};
```

Do not enqueue inside a React state-updater callback; React may invoke updater functions more than once in development. `summaryRef` makes revision assignment synchronous and single-shot, while the updater form always derives from the latest `summaryRef.current.project` rather than a stale render snapshot.

`runSessionOperation()` delegates to `operationQueue.run()` and must:

1. acquire its queue token synchronously before any `await`;
2. await `synchronizer.flush()`;
3. run exactly one Main-owned action;
4. report errors through the existing Japanese status path; queue-owned `finally` releases only that operation's token.

Use `runSessionOperation()` for **new, open, save, save-as, target selection, validation, and save-then-export**. Any later references/template UI must use the same path. Set `disabled={busy}` on the project-name input as well as buttons and `GenerationSettingsForm`.

- `newProject`/`openProject`: if not canceled, `adoptSummary(result.summary)`.
- `saveProject`: always `adoptSummary(result.summary)` before checking `canceled`; show the success notice only when `!result.canceled && !result.summary.dirty`. A concurrent-save defensive result remains visibly dirty.
- `selectTarget`: adopt the returned `SessionSnapshot`; do not compose a target into stale local state.
- `validateProject`: pass no Project argument.
- `saveThenExport`: pass the current snapshot and `adoptSummary`; set the ZIP link only when export itself succeeds.
- Project name changes call `commitProject((current) => ({ ...current, name, updatedAt: new Date().toISOString() }))`.
- Generation changes call `commitProject((current) => ({ ...current, generation, updatedAt: new Date().toISOString() }))`; this preserves a name edit already present in `summaryRef` even if React has not rerendered yet.

Subscribe once to both close events:

- On `onFlushBeforeClose(requestId)`, call `operationQueue.beginClose(requestId, async () => { await synchronizer.flush(); await closeReady(requestId); })`. On failure, show the safe message and do not acknowledge; Main's timeout path will cancel.
- On `onCloseCanceled(requestId)`, call `operationQueue.cancelClose(requestId)`. If close is approved, the token intentionally remains until the window is destroyed.
- Return both unsubscribe functions from the effect cleanup and call `operationQueue.dispose()` on unmount.

This barrier prevents edits between close flush and the end of native save/discard/cancel handling, while the Main operation queue is the second line of defense.

Keep the existing `GenerationSettingsForm` component and `applyGenerationPatch()` behavior; its `onChange` passes the new generation value into the updater-form `commitProject()` above.

Use event-handler work instead of effects for edits, matching the React performance rule `rerender-move-effect-to-event`. Do not add a Project-wide synchronization effect that runs after every render.

- [ ] **Step 9: Add the existing-generation characterization test**

Append to `tests/generation-settings-form.test.ts`:

```ts
import { createProject } from '../src/shared/defaults.js';
import { validateProject } from '../src/shared/validation.js';

it('文書生成指示を入力すると新規生成プロジェクトの事前検査を通過できる', () => {
  const project = createProject('document_generation');
  const generation = applyGenerationPatch(project.generation!, {
    instructions: '背景、目的、日程、リスクを含む計画書を作成する'
  });
  const issues = validateProject({ ...project, generation });
  expect(issues).toEqual([]);
});
```

This is a characterization test for code already present in HEAD, so it is expected to pass immediately; do not modify generation production code merely to force a RED state.

- [ ] **Step 10: Run all Task 5 focused tests, then the atomic full gate**

```powershell
npm.cmd test -- tests/preload.test.ts tests/session-handlers.test.ts tests/draft-synchronizer.test.ts tests/session-operation-queue.test.ts tests/session-actions.test.ts tests/generation-settings-form.test.ts
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Expected: all focused tests and the full suite pass, all three TypeScript projects typecheck, and the production build emits one usable `dist/preload/preload.js` without a local bridge dependency.

- [ ] **Step 11: Commit Task 5 atomically**

```powershell
git add -- src/shared/ipc.ts src/shared/model.ts src/main/session-handlers.ts src/main/main.ts src/preload/preload.ts src/renderer/draft-synchronizer.ts src/renderer/session-operation-queue.ts src/renderer/session-actions.ts src/renderer/App.tsx tests/preload.test.ts tests/session-handlers.test.ts tests/draft-synchronizer.test.ts tests/session-operation-queue.test.ts tests/session-actions.test.ts tests/generation-settings-form.test.ts
git commit -m "fix: synchronize Electron project sessions safely"
```

---

### Task 6: Full regression, rendered verification, and cleanup

**Files:**
- Modify only files required by failures found in this task.
- Do not commit screenshots, logs, profiles, or temporary GUI scripts.

**Interfaces:**
- Consumes: the completed application from Tasks 1–5.
- Produces: current-tree verification evidence and no remaining test processes.

- [ ] **Step 1: Run the complete automated gate**

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
git diff --check
```

Expected: all commands exit `0`; Vitest reports every test file and test passing; Vite production build completes.

- [ ] **Step 2: Launch an isolated production Electron session**

Launch the Electron binary directly (not `npm.cmd`, whose PID would be only a wrapper). Assemble one test-owned orchestration script at a unique `%TEMP%\CheckListMaker-gui-orchestrator-<guid>.ps1` path, outside the repository, **before running it**. The script creates its own `$runRoot`; record `$PSCommandPath` so the exact script can remove itself during cleanup. Its outer `try` starts before `Start-Process`, performs launch/readiness/attach, then remains alive waiting for an external done/abort signal while Codex performs Steps 3–7. Its `finally` is the exact Step 8 cleanup. A bounded watchdog enters `finally` even if the controlling turn is interrupted and never signals completion.

Use a loopback-only ephemeral CDP port and persist PID, executable path, process start time, profile, and Playwright session identity:

```powershell
$repo = (Resolve-Path '.').Path
$runRoot = Join-Path ([IO.Path]::GetTempPath()) ("CheckListMaker-gui-" + [guid]::NewGuid().ToString('N'))
$profile = Join-Path $runRoot 'profile'
$artifacts = Join-Path $runRoot 'artifacts'
$evidence = Join-Path $runRoot 'evidence'
$control = Join-Path $runRoot 'control'
New-Item -ItemType Directory -Force -Path $profile, $artifacts, $evidence, $control | Out-Null
$statePath = Join-Path $evidence 'run-state.json'
$doneSignal = Join-Path $control 'done.signal'
$abortSignal = Join-Path $control 'abort.signal'
$pwSession = 'clm-' + [guid]::NewGuid().ToString('N')
$pwConfig = Join-Path $evidence 'playwright.config.mjs'
$evidenceLiteral = ConvertTo-Json $evidence -Compress
Set-Content -LiteralPath $pwConfig -Encoding utf8 -Value "export default { outputDir: $evidenceLiteral };"

$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$probe.Start()
$port = ([Net.IPEndPoint]$probe.LocalEndpoint).Port
$probe.Stop()

$electron = (Resolve-Path 'node_modules\electron\dist\electron.exe').Path
$version = $null
$process = $null
$processStartTimeUtc = $null
try {
$process = Start-Process -FilePath $electron -WorkingDirectory $repo -PassThru -ArgumentList @(
  "--user-data-dir=$profile",
  '--remote-debugging-address=127.0.0.1',
  "--remote-debugging-port=$port",
  '.'
)
$processStartTimeUtc = $process.StartTime.ToUniversalTime().ToString('O')

[ordered]@{
  mainPid = $process.Id
  electronPath = $electron
  processStartTimeUtc = $processStartTimeUtc
  port = $port
  runRoot = $runRoot
  profile = $profile
  artifacts = $artifacts
  evidence = $evidence
  orchestratorPath = $PSCommandPath
  control = $control
  doneSignal = $doneSignal
  abortSignal = $abortSignal
  pwSession = $pwSession
  pwConfig = $pwConfig
  projectPath = (Join-Path $artifacts 'gui-project.clmproj')
  zipPath = (Join-Path $artifacts 'gui-package.zip')
} | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
Write-Output "STATE_PATH=$statePath"

$deadline = [DateTime]::UtcNow.AddSeconds(15)
do {
  try {
    $version = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 1
    break
  } catch {
    Start-Sleep -Milliseconds 250
  }
} while ([DateTime]::UtcNow -lt $deadline)
if (-not $version) { throw "Electron CDP did not become ready on port $port" }

$pwBaseArgs = @('--yes', '--package', '@playwright/cli', 'playwright-cli', "-s=$pwSession")
& npx.cmd @pwBaseArgs attach "--cdp=http://127.0.0.1:$port" "--config=$pwConfig"
if ($LASTEXITCODE -ne 0) { throw "Playwright CDP attach failed: $LASTEXITCODE" }

$watchdogDeadline = [DateTime]::UtcNow.AddMinutes(20)
while (-not (Test-Path -LiteralPath $doneSignal)) {
  if (Test-Path -LiteralPath $abortSignal) { throw 'GUI test controller signaled failure.' }
  if ([DateTime]::UtcNow -ge $watchdogDeadline) { throw 'GUI test watchdog timed out after 20 minutes.' }
  Start-Sleep -Milliseconds 250
}
# Step 8 supplies this try block's finally.
```

Run the orchestration script as a yielded/background shell cell with a timeout longer than 20 minutes, read its printed `STATE_PATH`, and keep that exact cell ID for Step 8. Use the `playwright` browser-automation skill and the recorded `pwSession` for every browser command; never create a second anonymous session. Give snapshot/screenshot commands explicit external paths such as `--filename=$evidence\generation.yml` and `--filename=$evidence\generation.png`. Use 10-second bounded waits per action/assertion. Use Computer Use only for OS-native dialogs. Write screenshots and a machine-readable assertion result under the recorded `evidence` directory, never under the repository or a default `.playwright-cli` folder. On a Step 3–7 failure, create only the exact recorded `abortSignal`; after successful Step 7 inspection, create only the exact recorded `doneSignal`.

- [ ] **Step 3: Verify the fixed generation path**

Interaction:

```text
app loads
→ 文書を生成して検証
→ 文書生成指示へ有効な内容を入力
→ 事前検査
→ エラー 0 / 警告 0
```

Assert the production `file:` URL, title, nonblank DOM, no framework overlay, and no relevant console error/warning. Capture a desktop screenshot outside the repository.

- [ ] **Step 4: Verify unsaved cancel and discard**

Interaction:

```text
プロジェクト名を変更
→ 別モードを選択
→ native未保存確認
→ キャンセル
→ 元の名前・モード・未保存状態を確認
→ 再度別モードを選択
→ 保存せずに続行
→ 新しいモードへ切替を確認
```

Then edit again, click the window close button, choose `キャンセル`, and assert the same window, mode, text, and dirty badge remain. Use Computer Use for native dialogs if available. If unavailable, record the exact blocker and use the adapter/session/close tests as button-branch evidence; still verify surrounding Renderer states through Electron CDP.

- [ ] **Step 5: Verify clean user-facing errors and dirty export**

- Trigger a generation-project save without instructions and assert the status contains the Japanese validation message but not `Error invoking remote method`, an IPC channel, a local path, or a stack.
- Enter valid instructions, click ZIP export, cancel the first Project-save dialog, and assert no ZIP dialog/link appears and the Project remains dirty.
- Repeat export, save the Project to the recorded exact `projectPath`, then cancel the ZIP destination dialog. Assert the UI is now clean because Project save succeeded even though ZIP export was canceled.
- Edit the name once more and run validation. Assert no draft-sync rejection appears; this proves the next revision started from the save snapshot.
- Optionally finish one export to the recorded exact `zipPath`, assert the ZIP link appears, and include that path in cleanup.

- [ ] **Step 6: Verify narrow layout and keyboard focus**

At 480×900 emulated viewport, assert no horizontal overflow, one-column workspace, readable generation fields, and no footer overlap. Verify the first Tab target and the 3px focus outline.

- [ ] **Step 7: Inspect screenshots and current-tree evidence**

Open each screenshot at original detail. Reject completion for clipping, black/partial capture, unreadable text, overlap, missing fields, or stale state. Store the machine-readable smoke result and screenshots outside the repository.

After every assertion and visual inspection succeeds, create the recorded completion signal so the waiting orchestration script enters its `finally`:

```powershell
$state = Get-Content -Raw -LiteralPath '<recorded absolute STATE_PATH>' | ConvertFrom-Json
New-Item -ItemType File -Force -Path ([string]$state.doneSignal) | Out-Null
```

- [ ] **Step 8: Stop and remove only test-owned resources**

Wait on the yielded orchestration cell after signaling done/abort; this cleanup runs as its mandatory `finally`. If cleanup must be resumed in a new shell, use the exact recorded `STATE_PATH`. Detach only the recorded Playwright session. For the raw Main PID, require PID **and** exact Electron executable **and** matching process start time before stopping it; child Electron processes are owned only when their command line contains the unique profile. Re-query owned processes and wait for them to disappear before deleting the profile.

```powershell
} finally {
# In a new shell only, first assign $statePath from the exact STATE_PATH printed by Step 2.
# $statePath = '<recorded absolute STATE_PATH>'
if (Test-Path -LiteralPath $statePath) {
  $state = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
} elseif ($process) {
  # Same-script fallback if persistence failed after Start-Process.
  $state = [pscustomobject]@{
    mainPid = $process.Id; electronPath = $electron; processStartTimeUtc = $processStartTimeUtc
    port = $port; profile = $profile; artifacts = $artifacts; control = $control
    orchestratorPath = $PSCommandPath; pwSession = $pwSession
  }
} else {
  # Start-Process itself failed; there is no owned process or profile lock to stop.
  $state = $null
}

if ($state) {
& npx.cmd --yes --package @playwright/cli playwright-cli "-s=$($state.pwSession)" detach 2>$null

function Get-TestOwnedProcess {
  $expectedExe = [IO.Path]::GetFullPath([string]$state.electronPath)
  $expectedStart = [DateTime]::Parse([string]$state.processStartTimeUtc).ToUniversalTime()
  Get-CimInstance Win32_Process | Where-Object {
    $profileOwned = $_.CommandLine -and
      $_.CommandLine.Contains([string]$state.profile, [StringComparison]::OrdinalIgnoreCase)
    $mainOwned = $false
    if ($_.ProcessId -eq [int]$state.mainPid -and $_.ExecutablePath -and $_.CreationDate) {
      $sameExe = [IO.Path]::GetFullPath($_.ExecutablePath).Equals(
        $expectedExe,
        [StringComparison]::OrdinalIgnoreCase
      )
      $sameStart = [Math]::Abs(($_.CreationDate.ToUniversalTime() - $expectedStart).TotalSeconds) -lt 2
      $mainOwned = $sameExe -and $sameStart
    }
    $profileOwned -or $mainOwned
  }
}

$owned = @(Get-TestOwnedProcess)
$owned | Sort-Object ProcessId -Descending | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
  $remaining = @(Get-TestOwnedProcess)
  if ($remaining.Count -eq 0) { break }
  Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
if ($remaining.Count -ne 0) {
  throw "Test-owned Electron processes did not stop: $($remaining.ProcessId -join ',')"
}

$deadline = [DateTime]::UtcNow.AddSeconds(10)
do {
  $listener = Get-NetTCPConnection -State Listen -LocalPort ([int]$state.port) -ErrorAction SilentlyContinue
  if (-not $listener) { break }
  Start-Sleep -Milliseconds 250
} while ([DateTime]::UtcNow -lt $deadline)
if ($listener) { throw "Test-owned CDP port is still listening: $($state.port)" }

$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
foreach ($candidate in @(
  [string]$state.profile,
  [string]$state.artifacts,
  [string]$state.control,
  [string]$state.orchestratorPath
)) {
  $resolved = [IO.Path]::GetFullPath($candidate)
  if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove a path outside TEMP: $resolved"
  }
  if (Test-Path -LiteralPath $resolved) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
}
}
```

Keep only the inspected `evidence` directory and `run-state.json` for handoff. Preserve unrelated processes/files and the user's untracked `.gitignore`.

- [ ] **Step 9: Review the implementation diff**

```powershell
git status --short --branch --untracked-files=normal
git diff --check
git log --oneline --decorate -10
```

Confirm only task-owned files and expected commits are present. If Task 6 required a corrective code change, add a regression test first, rerun the full gate, and commit that correction separately with a focused message.
