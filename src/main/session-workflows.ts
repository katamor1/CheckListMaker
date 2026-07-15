import type { ExportResult, SessionChangeResult } from '../shared/model.js';
import { UserFacingError } from '../shared/ipc-result.js';
import { validateProject } from '../shared/validation.js';
import type {
  ProjectSessionContext,
  ProjectSessionManager,
  SavePathPicker
} from './project-session.js';

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
      await ports.showError(
        '保存中に新しい変更があったため、操作を中止しました。もう一度実行してください。'
      );
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
    throw new UserFacingError(
      'PROJECT_DIRTY',
      'プロジェクトを保存してからパッケージを作成してください。'
    );
  }
  const firstError = validateProject(current.project).find((issue) => issue.severity === 'error');
  if (firstError) {
    throw new UserFacingError(
      'PROJECT_INVALID',
      `パッケージを作成できません: ${firstError.message}`
    );
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
