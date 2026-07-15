import type {
  ChecklistDefinition,
  DocumentGenerationDefinition,
  ProjectDefinition,
  ProjectMode,
  ReferenceDocumentDefinition,
  RepairPolicy,
  ValidationIssue
} from '../shared/model.js';
import { ChecklistEditor } from './ChecklistEditor.js';
import { GenerationSettingsForm } from './GenerationSettingsForm.js';
import { ReferenceEditor } from './ReferenceEditor.js';

export type WorkspaceSection = 'overview' | 'references' | 'checklist';

export const modeLabel = (mode: ProjectMode): string =>
  mode === 'existing_document' ? '既存文書を検証' : '文書を生成して検証';

const repairPolicyLabel = (policy: RepairPolicy): string => {
  switch (policy) {
    case 'auto_fix': return '安全な場合は自動修正';
    case 'suggest_only': return '修正案のみ';
    case 'do_not_modify': return '変更・具体案を禁止';
  }
};

export interface ProjectWorkspaceProps {
  project: ProjectDefinition;
  dirty: boolean;
  activeSection: WorkspaceSection;
  issues: readonly ValidationIssue[];
  busy: boolean;
  onSectionChange(section: WorkspaceSection): void;
  onProjectNameChange(name: string): void;
  onTargetSelect(): void;
  onGenerationChange(generation: DocumentGenerationDefinition): void;
  onReferencesSelect(): void;
  onReferencesChange(references: ReferenceDocumentDefinition[]): void;
  onChecklistChange(checklist: ChecklistDefinition): void;
  onDefaultRepairPolicyChange(policy: RepairPolicy): void;
  onSave(saveAs: boolean): void;
  onValidate(): void;
  onExport(): void;
}

export const ProjectWorkspace = ({
  project,
  dirty,
  activeSection: activeSection,
  issues,
  busy,
  onSectionChange,
  onProjectNameChange,
  onTargetSelect,
  onGenerationChange,
  onReferencesSelect,
  onReferencesChange,
  onChecklistChange,
  onDefaultRepairPolicyChange,
  onSave,
  onValidate,
  onExport
}: ProjectWorkspaceProps) => {
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;

  return (
    <section className="workspace" aria-label="プロジェクトワークスペース">
      <div className="panel primary-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">PROJECT</p>
            <h2>{modeLabel(project.mode)}</h2>
          </div>
          <span className={dirty ? 'status warning' : 'status ok'}>
            {dirty ? '未保存' : '保存済み'}
          </span>
        </div>

        <dl className="project-stats">
          <div><dt>チェック項目</dt><dd>{project.checklist.items.length}</dd></div>
          <div><dt>参考資料</dt><dd>{project.references.length}</dd></div>
          <div><dt>既定修正方針</dt><dd>{repairPolicyLabel(project.defaultRepairPolicy)}</dd></div>
        </dl>

        <nav className="workspace-tabs" aria-label="編集セクション" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'overview'}
            className={activeSection === 'overview' ? 'active' : ''}
            onClick={() => onSectionChange('overview')}
            disabled={busy}
          >概要・文書</button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'references'}
            className={activeSection === 'references' ? 'active' : ''}
            onClick={() => onSectionChange('references')}
            disabled={busy}
          >参考資料 <span className="tab-count">{project.references.length}</span></button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'checklist'}
            className={activeSection === 'checklist' ? 'active' : ''}
            onClick={() => onSectionChange('checklist')}
            disabled={busy}
          >チェックリスト <span className="tab-count">{project.checklist.items.length}</span></button>
        </nav>

        <div className="workspace-content" role="tabpanel">
          {activeSection === 'overview' ? (
            <section className="editor-section" aria-labelledby="overview-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">OVERVIEW</p>
                  <h3 id="overview-heading">概要・文書</h3>
                </div>
              </div>

              <label className="field">
                <span>プロジェクト名</span>
                <input
                  value={project.name}
                  onChange={(event) => onProjectNameChange(event.target.value)}
                  disabled={busy}
                />
              </label>

              {project.mode === 'existing_document' ? (
                <div className="document-card">
                  <div>
                    <strong>主対象文書</strong>
                    <p>{project.target?.originalFileName ?? '未選択'}</p>
                  </div>
                  <button type="button" className="secondary" onClick={onTargetSelect} disabled={busy}>文書を選択</button>
                </div>
              ) : project.generation ? (
                <GenerationSettingsForm generation={project.generation} disabled={busy} onChange={onGenerationChange} />
              ) : (
                <p className="empty-state">文書生成設定がありません。プロジェクトを作り直してください。</p>
              )}
            </section>
          ) : null}

          {activeSection === 'references' ? (
            <ReferenceEditor
              references={project.references}
              roles={project.checklist.requiredReferenceRoles}
              disabled={busy}
              onAdd={onReferencesSelect}
              onChange={onReferencesChange}
            />
          ) : null}

          {activeSection === 'checklist' ? (
            <ChecklistEditor
              checklist={project.checklist}
              defaultRepairPolicy={project.defaultRepairPolicy}
              references={project.references.map((reference) => ({ id: reference.id, title: reference.title }))}
              disabled={busy}
              onChecklistChange={onChecklistChange}
              onDefaultRepairPolicyChange={onDefaultRepairPolicyChange}
            />
          ) : null}
        </div>

        <div className="actions workspace-actions">
          <button type="button" onClick={() => onSave(false)} disabled={busy}>保存</button>
          <button type="button" className="secondary" onClick={() => onSave(true)} disabled={busy}>名前を付けて保存</button>
          <button type="button" className="secondary" onClick={onValidate} disabled={busy}>事前検査</button>
          <button type="button" onClick={onExport} disabled={busy}>Copilot用ZIPを作成</button>
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
  );
};
