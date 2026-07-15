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
import { DraftSynchronizer } from './draft-synchronizer.js';
import { ProjectWorkspace, modeLabel, type WorkspaceSection } from './ProjectWorkspace.js';
import { appendSelectedReferences } from './reference-editor-model.js';
import { saveThenExport } from './session-actions.js';
import { SessionOperationQueue } from './session-operation-queue.js';
import {
  RendererSessionOrchestrator,
  normalizeRendererError,
  safeRendererErrorMessage
} from './session-orchestrator.js';

type Versions = {
  application: string;
  electron: string;
  node: string;
  chrome: string;
};

export const App = () => {
  const [summary, setSummary] = useState<SessionSnapshot | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [versions, setVersions] = useState<Versions | null>(null);
  const [notice, setNotice] = useState('プロジェクトを新規作成するか、既存の.clmprojを開いてください。');
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
      reportError: (error) => setNotice(safeRendererErrorMessage(normalizeRendererError(error)))
    });
  }
  const orchestrator = orchestratorRef.current;

  useEffect(() => {
    void window.checklistMaker
      .getVersions()
      .then(setVersions)
      .catch((error: unknown) => setNotice(
        safeRendererErrorMessage(normalizeRendererError(error))
      ));
  }, []);

  useEffect(() => orchestrator.subscribeClose(), [orchestrator]);

  const project = summary?.project;

  const createProject = (mode: ProjectMode): void => {
    void orchestrator.runSessionOperation(async () => {
      const result = await window.checklistMaker.newProject(mode);
      if (result.canceled || !result.summary) return;
      orchestrator.adoptSummary(result.summary);
      setIssues([]);
      setActiveSection('overview');
      setLastExportPath(null);
      setNotice(`${modeLabel(mode)}プロジェクトを作成しました。`);
    });
  };

  const openProject = (): void => {
    void orchestrator.runSessionOperation(async () => {
      const result = await window.checklistMaker.openProject();
      if (result.canceled || !result.summary) return;
      orchestrator.adoptSummary(result.summary);
      setIssues([]);
      setActiveSection('overview');
      setLastExportPath(null);
      setNotice('プロジェクトを開きました。');
    });
  };

  const updateProjectName = (name: string): void => {
    orchestrator.commitProject((current) => ({
      ...current,
      name,
      updatedAt: new Date().toISOString()
    }));
  };

  const updateGeneration = (generation: DocumentGenerationDefinition): void => {
    orchestrator.commitProject((current) => ({
      ...current,
      generation,
      updatedAt: new Date().toISOString()
    }));
  };

  const updateReferences = (references: ReferenceDocumentDefinition[]): void => {
    orchestrator.commitProject((current) => ({
      ...current,
      references,
      updatedAt: new Date().toISOString()
    }));
  };

  const updateChecklist = (checklist: ChecklistDefinition): void => {
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
    orchestrator.commitProject((current) => ({
      ...current,
      defaultRepairPolicy,
      updatedAt: new Date().toISOString()
    }));
  };

  const selectTarget = (): void => {
    if (!summaryRef.current) return;
    void orchestrator.runSessionOperation(async () => {
      const next = await window.checklistMaker.selectTarget();
      if (!next) return;
      orchestrator.adoptSummary(next);
      const targetName = next.project.target?.originalFileName;
      if (targetName) setNotice(`${targetName}を主対象文書として登録しました。`);
    });
  };

  const selectReferences = (): void => {
    if (!summaryRef.current) return;
    void orchestrator
      .runSessionOperation(() => window.checklistMaker.selectReferences())
      .then((documents) => {
        if (documents.length === 0) return;
        orchestrator.commitProject((current) => appendSelectedReferences(current, documents));
        setActiveSection('references');
        setNotice(`${documents.length}件の参考資料を登録しました。用途、権威レベル、優先順位を確認してください。`);
      }, () => undefined);
  };

  const validate = (): void => {
    if (!summaryRef.current) return;
    void orchestrator.runSessionOperation(async () => {
      const nextIssues = await window.checklistMaker.validateProject();
      setIssues(nextIssues);
      setNotice(nextIssues.length === 0
        ? '事前検査に合格しました。'
        : `事前検査で${nextIssues.length}件の指摘があります。`);
    });
  };

  const save = (saveAs = false): void => {
    if (!summaryRef.current) return;
    void orchestrator.runSessionOperation(async () => {
      const result = await window.checklistMaker.saveProject(saveAs);
      orchestrator.adoptSummary(result.summary);
      if (result.canceled) return;
      if (result.summary.dirty) {
        setNotice('保存中に新しい変更があったため、未保存のままです。');
        return;
      }
      setNotice(saveAs ? '名前を付けて保存しました。' : 'プロジェクトを保存しました。');
    });
  };

  const exportPackage = (): void => {
    if (!summaryRef.current) return;
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
      setNotice(`Copilot用ZIPを生成しました（${result.fileCount ?? 0}ファイル）。`);
    });
  };

  const openExportFolder = (): void => {
    const path = lastExportPath;
    if (!path) return;
    void orchestrator.runSessionOperation(async () => window.checklistMaker.openFolder(path));
  };

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">LOCAL DOCUMENT VALIDATION PACKAGE BUILDER</p>
          <h1>CheckListMaker</h1>
          <p className="lede">チェックリストと対象文書から、Copilotで自己検証できる実行ZIPを作成します。</p>
        </div>
        {versions ? (
          <dl className="versions" aria-label="アプリケーションのバージョン">
            <div><dt>App</dt><dd>{versions.application}</dd></div>
            <div><dt>Electron</dt><dd>{versions.electron}</dd></div>
          </dl>
        ) : null}
      </header>

      <section className="command-bar" aria-label="プロジェクト操作">
        <button type="button" onClick={() => createProject('existing_document')} disabled={busy}>既存文書を検証</button>
        <button type="button" onClick={() => createProject('document_generation')} disabled={busy}>文書を生成して検証</button>
        <button type="button" className="secondary" onClick={openProject} disabled={busy}>プロジェクトを開く</button>
      </section>

      {project ? (
        <ProjectWorkspace
          project={project}
          dirty={summary?.dirty ?? true}
          activeSection={activeSection}
          issues={issues}
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
          <h2>ローカルで準備し、Copilotへ手動で渡す</h2>
          <p>文書や参考資料は、パッケージを明示的にエクスポートするまで外部へ送信されません。</p>
        </section>
      )}

      <footer className="app-footer">
        <p role="status" aria-live="polite">{busy ? '処理中…' : notice}</p>
        {lastExportPath ? <button type="button" className="link-button" onClick={openExportFolder}>生成したZIPを表示</button> : null}
      </footer>
    </main>
  );
};