import { useEffect, useRef, useState } from 'react';
import type {
  ChecklistDefinition,
  DocumentGenerationDefinition,
  ProjectMode,
  ReferenceDocumentDefinition,
  RepairPolicy,
  SessionSnapshot,
  ValidationIssue
} from '../shared/model.js';
import {
  actions,
  messages,
  packageCreatedMessage,
  preflightIssueCountMessage,
  projectCreatedMessage,
  projectModeLabel,
  referencesRegisteredMessage,
  terminology
} from '../shared/presentation/ja/index.js';
import { DraftSynchronizer } from './draft-synchronizer.js';
import { ProjectWorkspace, type WorkspaceSection } from './ProjectWorkspace.js';
import { appendSelectedReferences } from './reference-editor-model.js';
import { saveThenExport } from './session-actions.js';
import { SessionOperationQueue } from './session-operation-queue.js';
import {
  RendererSessionOrchestrator,
  safeRendererError,
  type RendererUserFacingError
} from './session-orchestrator.js';
import { UserFacingErrorNotice } from './UserFacingErrorNotice.js';

type Versions = {
  application: string;
  electron: string;
  node: string;
  chrome: string;
};

export const App = () => {
  const [summary, setSummary] = useState<SessionSnapshot | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [preflightHasRun, setPreflightHasRun] = useState(false);
  const [versions, setVersions] = useState<Versions | null>(null);
  const [notice, setNotice] = useState(messages.initialProjectPrompt);
  const [userError, setUserError] = useState<RendererUserFacingError | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const summaryRef = useRef<SessionSnapshot | null>(null);
  const synchronizerRef = useRef<DraftSynchronizer | null>(null);
  const operationQueueRef = useRef<SessionOperationQueue | null>(null);
  const orchestratorRef = useRef<RendererSessionOrchestrator | null>(null);

  if (!synchronizerRef.current) {
    synchronizerRef.current = new DraftSynchronizer(
      (project, revision) => window.checklistMaker.updateProject(project, revision),
      0
    );
  }
  if (!operationQueueRef.current) {
    operationQueueRef.current = new SessionOperationQueue(setBusy);
  }
  const synchronizer = synchronizerRef.current;
  const operationQueue = operationQueueRef.current;
  if (!orchestratorRef.current) {
    orchestratorRef.current = new RendererSessionOrchestrator({
      bridge: window.checklistMaker,
      summaryRef,
      synchronizer,
      operationQueue,
      publishSummary: setSummary,
      reportError: (error) => setUserError(safeRendererError(error))
    });
  }
  const orchestrator = orchestratorRef.current;

  useEffect(() => {
    void window.checklistMaker
      .getVersions()
      .then(setVersions)
      .catch((error: unknown) => setUserError(safeRendererError(error)));
  }, []);

  useEffect(() => orchestrator.subscribeClose(), [orchestrator]);

  const project = summary?.project;

  const beginOperation = (): void => {
    setUserError(null);
  };

  const markEdited = (): void => {
    setIssues([]);
    setPreflightHasRun(false);
    setUserError(null);
  };

  const createProject = (mode: ProjectMode): void => {
    beginOperation();
    void orchestrator.runSessionOperation(async () => {
      const result = await window.checklistMaker.newProject(mode);
      if (result.canceled || !result.summary) return;
      orchestrator.adoptSummary(result.summary);
      setIssues([]);
      setPreflightHasRun(false);
      setActiveSection('overview');
      setLastExportPath(null);
      setNotice(projectCreatedMessage(projectModeLabel(mode)));
    });
  };

  const openProject = (): void => {
    beginOperation();
    void orchestrator.runSessionOperation(async () => {
      const result = await window.checklistMaker.openProject();
      if (result.canceled || !result.summary) return;
      orchestrator.adoptSummary(result.summary);
      setIssues([]);
      setPreflightHasRun(false);
      setActiveSection('overview');
      setLastExportPath(null);
      setNotice(messages.projectOpened);
    });
  };

  const updateProjectName = (name: string): void => {
    markEdited();
    orchestrator.commitProject((current) => ({
      ...current,
      name,
      updatedAt: new Date().toISOString()
    }));
  };

  const updateGeneration = (generation: DocumentGenerationDefinition): void => {
    markEdited();
    orchestrator.commitProject((current) => ({
      ...current,
      generation,
      updatedAt: new Date().toISOString()
    }));
  };

  const updateReferences = (references: ReferenceDocumentDefinition[]): void => {
    markEdited();
    orchestrator.commitProject((current) => ({
      ...current,
      references,
      updatedAt: new Date().toISOString()
    }));
  };

  const updateChecklist = (checklist: ChecklistDefinition): void => {
    markEdited();
    const availableRoleIds = new Set(checklist.requiredReferenceRoles.map((role) => role.roleId));
    orchestrator.commitProject((current) => ({
      ...current,
      checklist,
      references: current.references.map((reference) => ({
        ...reference,
        roleIds: reference.roleIds.filter((roleId) => availableRoleIds.has(roleId))
      })),
      updatedAt: new Date().toISOString()
    }));
  };

  const updateDefaultRepairPolicy = (defaultRepairPolicy: RepairPolicy): void => {
    markEdited();
    orchestrator.commitProject((current) => ({
      ...current,
      defaultRepairPolicy,
      updatedAt: new Date().toISOString()
    }));
  };

  const selectTarget = (): void => {
    if (!summaryRef.current) return;
    beginOperation();
    void orchestrator.runSessionOperation(async () => {
      const next = await window.checklistMaker.selectTarget();
      if (!next) return;
      orchestrator.adoptSummary(next);
      setIssues([]);
      setPreflightHasRun(false);
      if (next.project.target) setNotice(messages.targetRegistered);
    });
  };

  const selectReferences = (): void => {
    if (!summaryRef.current) return;
    beginOperation();
    void orchestrator
      .runSessionOperation(() => window.checklistMaker.selectReferences())
      .then((documents) => {
        if (documents.length === 0) return;
        orchestrator.commitProject((current) => appendSelectedReferences(current, documents));
        setIssues([]);
        setPreflightHasRun(false);
        setActiveSection('references');
        setNotice(referencesRegisteredMessage(documents.length));
      }, () => undefined);
  };

  const validate = (): void => {
    if (!summaryRef.current) return;
    beginOperation();
    void orchestrator.runSessionOperation(async () => {
      const nextIssues = await window.checklistMaker.validateProject();
      setIssues(nextIssues);
      setPreflightHasRun(true);
      setNotice(nextIssues.length === 0
        ? messages.preflightPassed
        : preflightIssueCountMessage(nextIssues.length));
    });
  };

  const save = (saveAs = false): void => {
    if (!summaryRef.current) return;
    beginOperation();
    void orchestrator.runSessionOperation(async () => {
      const result = await window.checklistMaker.saveProject(saveAs);
      orchestrator.adoptSummary(result.summary);
      if (result.canceled) return;
      if (result.summary.dirty) {
        setNotice('保存中に新しい変更があったため、未保存の変更が残っています。');
        return;
      }
      setNotice(saveAs ? messages.projectSavedAs : messages.projectSaved);
    });
  };

  const exportPackage = (): void => {
    if (!summaryRef.current) return;
    beginOperation();
    void orchestrator.runSessionOperation(async () => {
      const current = summaryRef.current;
      if (!current) return;
      const result = await saveThenExport(
        current,
        window.checklistMaker,
        (next) => orchestrator.adoptSummary(next)
      );
      if (result.canceled || !result.path) return;
      setLastExportPath(result.path);
      setNotice(packageCreatedMessage(result.fileCount ?? 0));
    });
  };

  const openExportFolder = (): void => {
    const path = lastExportPath;
    if (!path) return;
    beginOperation();
    void orchestrator.runSessionOperation(async () => window.checklistMaker.openFolder(path));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">{terminology.productDescriptor}</p>
          <h1>CheckListMaker</h1>
          <p className="lede">チェックリストと対象文書から、Copilotで自己検証できる実行ZIPを作成します。</p>
        </div>
        {versions ? (
          <dl className="versions" aria-label={terminology.versionInformation}>
            <div><dt>App</dt><dd>{versions.application}</dd></div>
            <div><dt>Electron</dt><dd>{versions.electron}</dd></div>
          </dl>
        ) : null}
      </header>

      <section className="command-bar" aria-label="プロジェクト操作">
        <button type="button" onClick={() => createProject('existing_document')} disabled={busy}>{actions.createExistingProject}</button>
        <button type="button" onClick={() => createProject('document_generation')} disabled={busy}>{actions.createGenerationProject}</button>
        <button type="button" className="secondary" onClick={openProject} disabled={busy}>{actions.openProject}</button>
      </section>

      {project ? (
        <ProjectWorkspace
          project={project}
          dirty={summary?.dirty ?? true}
          activeSection={activeSection}
          issues={issues}
          preflightHasRun={preflightHasRun}
          busy={busy}
          onSectionChange={setActiveSection}
          onProjectNameChange={updateProjectName}
          onTargetSelect={selectTarget}
          onGenerationChange={updateGeneration}
          onReferencesSelect={selectReferences}
          onReferencesChange={updateReferences}
          onChecklistChange={updateChecklist}
          onDefaultRepairPolicyChange={updateDefaultRepairPolicy}
          onSave={save}
          onValidate={validate}
          onExport={exportPackage}
        />
      ) : (
        <section className="empty-workspace">
          <h2>{messages.projectNotOpen}</h2>
          <p>文書や参考資料は、Copilot用ZIPを明示的に作成するまで外部へ送信されません。</p>
        </section>
      )}

      {userError ? <UserFacingErrorNotice error={userError} /> : null}

      <footer className="app-footer">
        <p role="status" aria-live="polite">{busy ? messages.processing : notice}</p>
        {lastExportPath ? (
          <button type="button" className="link-button" onClick={openExportFolder}>{actions.openExportLocation}</button>
        ) : null}
      </footer>
    </main>
  );
};
