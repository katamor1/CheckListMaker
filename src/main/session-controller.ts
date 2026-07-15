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
    return this.manager.runExclusive(() =>
      this.manager.saveCurrent(saveAs, this.ports.pickProjectPath)
    );
  }

  validate(): Promise<ValidationIssue[]> {
    return this.manager.runExclusive(() =>
      validateProject(this.manager.requireCurrent().project)
    );
  }

  export(): Promise<ExportResult> {
    return this.manager.runExclusive(() => exportCleanSession(this.manager, this.ports));
  }
}
