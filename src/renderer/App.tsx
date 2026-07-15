import { useEffect, useMemo, useRef, useState } from 'react';
import { GENERIC_USER_MESSAGE } from '../shared/ipc-result.js';
import type {
  DocumentGenerationDefinition,
  ProjectDefinition,
  ProjectMode,
  SessionSnapshot,
  ValidationIssue
} from '../shared/model.js';
import { DraftSynchronizer, applyDraftEdit } from './draft-synchronizer.js';
import { GenerationSettingsForm } from './GenerationSettingsForm.js';
import { saveThenExport } from './session-actions.js';
import { SessionOperationQueue } from './session-operation-queue.js';

type Versions = {
  application: string;
  electron: string;
  node: string;
  chrome: string;
};

const modeLabel = (mode: ProjectMode): string =>
  mode === 'existing_document' ? '既存文書を検証' : '文書を生成して検証';

const safeErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : GENERIC_USER_MESSAGE;

export const App = () => {
  const [summary, setSummary] = useState<SessionSnapshot | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [versions, setVersions] = useState<Versions | null>(null);
  const [notice, setNotice] = useState('プロジェクトを新規作成するか、既存の.clmprojを開いてください。');
  const [busy, setBusy] = useState(false);
  const [lastExportPath, setLastExportPath] = useState<string | null>(null);
  const summaryRef = useRef<SessionSnapshot | null>(null);
  const synchronizerRef = useRef<DraftSynchronizer | null>(null);
  const operationQueueRef = useRef<SessionOperationQueue | null>(null);

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

  useEffect(() => {
    void window.checklistMaker
      .getVersions()
      .then(setVersions)
      .catch((error: unknown) => setNotice(safeErrorMessage(error)));
  }, []);

  useEffect(() => {
    const unsubscribeFlush = window.checklistMaker.onFlushBeforeClose((requestId) => {
      void operationQueue.beginClose(requestId, async () => {
        await synchronizer.flush();
        await window.checklistMaker.closeReady(requestId);
      }).catch((error: unknown) => {
        setNotice(safeErrorMessage(error));
      });
    });
    const unsubscribeCanceled = window.checklistMaker.onCloseCanceled((requestId) => {
      operationQueue.cancelClose(requestId);
    });
    return () => {
      unsubscribeFlush();
      unsubscribeCanceled();
      operationQueue.dispose();
    };
  }, [operationQueue, synchronizer]);

  const project = summary?.project;
  const errorCount = useMemo(() => issues.filter((issue) => issue.severity === 'error').length, [issues]);
  const warningCount = issues.length - errorCount;

  const adoptSummary = (next: SessionSnapshot): void => {
    synchronizer.reset(next.revision);
    summaryRef.current = next;
    setSummary(next);
  };

  const commitProject = (update: (project: ProjectDefinition) => ProjectDefinition): void => {
    const current = summaryRef.current;
    if (!current) return;
    const next = applyDraftEdit(
      current,
      update,
      (nextProject) => synchronizer.enqueue(nextProject),
      operationQueue.blocked
    );
    if (next === current) return;
    summaryRef.current = next;
    setSummary(next);
  };

  const runSessionOperation = (operation: () => Promise<void>): void => {
    void operationQueue.run(async () => {
      await synchronizer.flush();
      await operation();
    }).catch((error: unknown) => {
      setNotice(safeErrorMessage(error));
    });
  };

  const createProject = (mode: ProjectMode): void => {
    runSessionOperation(async () => {
      const result = await window.checklistMaker.newProject(mode);
      if (result.canceled || !result.summary) return;
      adoptSummary(result.summary);
      setIssues([]);
      setLastExportPath(null);
      setNotice(`${modeLabel(mode)}プロジェクトを作成しました。`);
    });
  };

  const openProject = (): void => {
    runSessionOperation(async () => {
      const result = await window.checklistMaker.openProject();
      if (result.canceled || !result.summary) return;
      adoptSummary(result.summary);
      setIssues([]);
      setLastExportPath(null);
      setNotice('プロジェクトを開きました。');
    });
  };

  const updateProjectName = (name: string): void => {
    commitProject((current) => ({
      ...current,
      name,
      updatedAt: new Date().toISOString()
    }));
  };

  const updateGeneration = (generation: DocumentGenerationDefinition): void => {
    commitProject((current) => ({
      ...current,
      generation,
      updatedAt: new Date().toISOString()
    }));
  };

  const selectTarget = (): void => {
    if (!summaryRef.current) return;
    runSessionOperation(async () => {
      const next = await window.checklistMaker.selectTarget();
      if (!next) return;
      adoptSummary(next);
      const targetName = next.project.target?.originalFileName;
      if (targetName) setNotice(`${targetName}を主対象文書として登録しました。`);
    });
  };

  const validate = (): void => {
    if (!summaryRef.current) return;
    runSessionOperation(async () => {
      const nextIssues = await window.checklistMaker.validateProject();
      setIssues(nextIssues);
      setNotice(nextIssues.length === 0 ? '事前検査に合格しました。' : `事前検査で${nextIssues.length}件の指摘があります。`);
    });
  };

  const save = (saveAs = false): void => {
    if (!summaryRef.current) return;
    runSessionOperation(async () => {
      const result = await window.checklistMaker.saveProject(saveAs);
      adoptSummary(result.summary);
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
    runSessionOperation(async () => {
      const current = summaryRef.current;
      if (!current) return;
      const result = await saveThenExport(current, window.checklistMaker, adoptSummary);
      if (result.canceled || !result.path) return;
      setLastExportPath(result.path);
      setNotice(`Copilot用ZIPを生成しました（${result.fileCount ?? 0}ファイル）。`);
    });
  };

  const openExportFolder = (): void => {
    const path = lastExportPath;
    if (!path) return;
    runSessionOperation(async () => window.checklistMaker.openFolder(path));
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
        <section className="workspace" aria-label="プロジェクト概要">
          <div className="panel primary-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PROJECT</p>
                <h2>{modeLabel(project.mode)}</h2>
              </div>
              <span className={summary?.dirty ? 'status warning' : 'status ok'}>
                {summary?.dirty ? '未保存' : '保存済み'}
              </span>
            </div>

            <label className="field">
              <span>プロジェクト名</span>
              <input
                value={project.name}
                onChange={(event) => updateProjectName(event.target.value)}
                disabled={busy}
              />
            </label>

            <dl className="project-stats">
              <div><dt>チェック項目</dt><dd>{project.checklist.items.length}</dd></div>
              <div><dt>参考資料</dt><dd>{project.references.length}</dd></div>
              <div><dt>既定修正方針</dt><dd>{project.defaultRepairPolicy}</dd></div>
            </dl>

            {project.mode === 'existing_document' ? (
              <div className="document-card">
                <div>
                  <strong>主対象文書</strong>
                  <p>{project.target?.originalFileName ?? '未選択'}</p>
                </div>
                <button type="button" className="secondary" onClick={selectTarget} disabled={busy}>文書を選択</button>
              </div>
            ) : project.generation ? (
              <GenerationSettingsForm generation={project.generation} disabled={busy} onChange={updateGeneration} />
            ) : (
              <p className="empty-state">文書生成設定がありません。プロジェクトを作り直してください。</p>
            )}

            <div className="actions">
              <button type="button" onClick={() => save(false)} disabled={busy}>保存</button>
              <button type="button" className="secondary" onClick={() => save(true)} disabled={busy}>名前を付けて保存</button>
              <button type="button" className="secondary" onClick={validate} disabled={busy}>事前検査</button>
              <button type="button" onClick={exportPackage} disabled={busy}>Copilot用ZIPを作成</button>
            </div>
          </div>

          <aside className="panel validation-panel" aria-label="事前検査結果">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">PREFLIGHT</p>
                <h2>事前検査</h2>
              </div>
              <span className="issue-count">エラー {errorCount} / 警告 {warningCount}</span>
            </div>
            {issues.length === 0 ? (
              <p className="empty-state">「事前検査」を実行すると、パッケージ生成前の問題をここに表示します。</p>
            ) : (
              <ul className="issue-list">
                {issues.map((issue, index) => (
                  <li key={`${issue.code}-${index}`} className={issue.severity}>
                    <strong>{issue.message}</strong>
                    <span>{issue.remediation}</span>
                    <code>{issue.code}</code>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </section>
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
