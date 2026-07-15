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
    return Promise.resolve(result);
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
