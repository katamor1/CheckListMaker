import { IPC } from '../shared/ipc.js';
import {
  KNOWN_USER_ERROR_CODES,
  UserFacingError,
  isUserFacingErrorPresentation,
  type UserFacingErrorPresentation
} from '../shared/ipc-result.js';
import type {
  ChecklistTemplateDefinition,
  DraftUpdateResult,
  ExportResult,
  ProjectDefinition,
  ProjectMode,
  SaveResult,
  SelectedDocument,
  SessionChangeResult,
  SessionSaveResult,
  SessionSnapshot,
  ValidationIssue
} from '../shared/model.js';
import { userFacingErrors } from '../shared/presentation/ja/index.js';
import type { DocumentRegistry } from './document-registry.js';
import type { ProjectSessionContext, ProjectSessionManager } from './project-session.js';

export interface SessionHandlerContext {
  senderId: number;
}

export interface SessionControllerPort {
  newProject(mode: ProjectMode): Promise<SessionChangeResult>;
  openProject(): Promise<SessionChangeResult>;
  updateDraft(value: unknown, revision: number): Promise<DraftUpdateResult>;
  save(saveAs: boolean): Promise<SessionSaveResult>;
  validate(): Promise<ValidationIssue[]>;
  export(): Promise<ExportResult>;
}

type SessionManagerPort = Pick<
  ProjectSessionManager,
  'runExclusive' | 'requireCurrent' | 'applyMainUpdate' | 'currentTemplate' | 'setCurrentTemplate'
>;

export interface SessionHandlerDependencies {
  manager: SessionManagerPort;
  controllerFor(senderId: number): SessionControllerPort;
  selectTarget(senderId: number, registry: DocumentRegistry): Promise<SelectedDocument | null>;
  selectReferences(senderId: number, registry: DocumentRegistry): Promise<SelectedDocument[]>;
  pickTemplateSavePath(senderId: number, defaultName: string): Promise<string | undefined>;
  pickTemplateOpenPath(senderId: number): Promise<string | undefined>;
  acknowledgeClose(senderId: number, requestId: string): void;
  measureOutput(path: string): Promise<number>;
  allowedOutputPaths: Set<string>;
}

const invalidArgument = (): never => {
  throw new UserFacingError('INVALID_ARGUMENT', userFacingErrors.invalidArgument);
};

const expectedFailure = async <T>(
  operation: () => Promise<T>,
  code: string,
  presentation: UserFacingErrorPresentation
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof UserFacingError &&
      KNOWN_USER_ERROR_CODES.has(error.code) &&
      isUserFacingErrorPresentation(error.presentation)
    ) {
      throw error;
    }
    throw new UserFacingError(code, presentation, error);
  }
};

const updateTarget = (
  manager: SessionManagerPort,
  target: SelectedDocument
): SessionSnapshot => manager.applyMainUpdate((project: ProjectDefinition) => ({
  ...project,
  target,
  updatedAt: new Date().toISOString()
}));

export const SESSION_INVOKE_CHANNELS = [
  IPC.newProject,
  IPC.openProject,
  IPC.updateProject,
  IPC.saveProject,
  IPC.selectTarget,
  IPC.selectReferences,
  IPC.exportPackage,
  IPC.validateProject,
  IPC.saveTemplate,
  IPC.openTemplate,
  IPC.closeReady
] as const;

export type SessionInvokeChannel = (typeof SESSION_INVOKE_CHANNELS)[number];
export type SessionHandler = (
  context: SessionHandlerContext,
  ...args: unknown[]
) => Promise<unknown>;
export type SessionHandlerMap = Record<SessionInvokeChannel, SessionHandler>;

export const createSessionHandlers = (
  dependencies: SessionHandlerDependencies
): SessionHandlerMap => ({
  [IPC.newProject]: async ({ senderId }, rawMode) => {
    if (rawMode !== 'existing_document' && rawMode !== 'document_generation') return invalidArgument();
    return dependencies.controllerFor(senderId).newProject(rawMode);
  },
  [IPC.openProject]: async ({ senderId }) => dependencies.controllerFor(senderId).openProject(),
  [IPC.updateProject]: async ({ senderId }, rawProject, rawRevision) => {
    if (!Number.isSafeInteger(rawRevision) || (rawRevision as number) <= 0) invalidArgument();
    return dependencies.controllerFor(senderId).updateDraft(rawProject, rawRevision as number);
  },
  [IPC.saveProject]: async ({ senderId }, rawSaveAs) => {
    if (typeof rawSaveAs !== 'boolean') return invalidArgument();
    return dependencies.controllerFor(senderId).save(rawSaveAs);
  },
  [IPC.selectTarget]: async ({ senderId }) => dependencies.manager.runExclusive(async () => {
    const current = dependencies.manager.requireCurrent();
    const selected = await expectedFailure(
      () => dependencies.selectTarget(senderId, current.resources.registry),
      'DOCUMENT_REGISTER_FAILED',
      userFacingErrors.targetRegisterFailed
    );
    return selected ? updateTarget(dependencies.manager, selected) : null;
  }),
  [IPC.selectReferences]: async ({ senderId }) => dependencies.manager.runExclusive(async () => {
    const current = dependencies.manager.requireCurrent();
    return expectedFailure(
      () => dependencies.selectReferences(senderId, current.resources.registry),
      'DOCUMENT_REGISTER_FAILED',
      userFacingErrors.referencesRegisterFailed
    );
  }),
  [IPC.exportPackage]: async ({ senderId }) => {
    const result = await expectedFailure(
      () => dependencies.controllerFor(senderId).export(),
      'PACKAGE_EXPORT_FAILED',
      userFacingErrors.packageExportFailed
    );
    if (result.canceled) return result;
    if (!result.path) {
      throw new UserFacingError('PACKAGE_EXPORT_FAILED', userFacingErrors.packageExportFailed);
    }
    const sizeBytes = await expectedFailure(
      () => dependencies.measureOutput(result.path as string),
      'PACKAGE_EXPORT_FAILED',
      userFacingErrors.packageExportFailed
    );
    dependencies.allowedOutputPaths.add(result.path);
    return { ...result, sizeBytes };
  },
  [IPC.validateProject]: async ({ senderId }) => dependencies.controllerFor(senderId).validate(),
  [IPC.saveTemplate]: async ({ senderId }): Promise<SaveResult> =>
    dependencies.manager.runExclusive(async () => {
      const current: ProjectSessionContext = dependencies.manager.requireCurrent();
      const path = await dependencies.pickTemplateSavePath(senderId, current.project.checklist.name);
      if (!path) return { canceled: true };
      const saved = await expectedFailure(
        () => current.resources.store.saveTemplate(
          path,
          current.project,
          dependencies.manager.currentTemplate()
        ),
        'TEMPLATE_SAVE_FAILED',
        userFacingErrors.templateSaveFailed
      );
      dependencies.manager.setCurrentTemplate(saved);
      return { canceled: false, path };
    }),
  [IPC.openTemplate]: async ({ senderId }): Promise<ChecklistTemplateDefinition | null> =>
    dependencies.manager.runExclusive(async () => {
      const current = dependencies.manager.requireCurrent();
      const path = await dependencies.pickTemplateOpenPath(senderId);
      if (!path) return null;
      const opened = await expectedFailure(
        () => current.resources.store.openTemplate(path),
        'TEMPLATE_OPEN_FAILED',
        userFacingErrors.templateOpenFailed
      );
      dependencies.manager.setCurrentTemplate(opened);
      return opened;
    }),
  [IPC.closeReady]: async ({ senderId }, rawRequestId) => {
    if (typeof rawRequestId !== 'string') return invalidArgument();
    dependencies.acknowledgeClose(senderId, rawRequestId);
  }
});
