import type {
  ChecklistDefinition,
  DocumentGenerationDefinition,
  ProjectDefinition,
  ProjectMode,
  ReferenceDocumentDefinition,
  RepairPolicy,
  ValidationIssue
} from '../shared/model.js';
import {
  actions,
  messages,
  projectModeLabel,
  repairPolicyLabels,
  statuses,
  terminology
} from '../shared/presentation/ja/index.js';
import { ChecklistEditor } from './ChecklistEditor.js';
import { GenerationSettingsForm } from './GenerationSettingsForm.js';
import { PreflightIssueList } from './PreflightIssueList.js';
import { ReferenceEditor } from './ReferenceEditor.js';

export type WorkspaceSection = 'overview' | 'references' | 'checklist';

export const modeLabel = (mode: ProjectMode): string => projectModeLabel(mode);

const repairPolicyLabel = (policy: RepairPolicy): string => repairPolicyLabels[policy];

export interface ProjectWorkspaceProps {
  project: ProjectDefinition;
  dirty: boolean;
  activeSection: WorkspaceSection;
  issues: readonly ValidationIssue[];
  preflightHasRun: boolean;
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
  activeSection,
  issues,
  preflightHasRun,
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
    <section className="workspace" aria-label="プロジェクト編集">
      <div className="panel primary-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{terminology.project}</p>
            <h2>{modeLabel(project.mode)}</h2>
          </div>
          <span className={dirty ? 'status warning' : 'status ok'}>
            {dirty ? statuses.unsaved : statuses.saved}
          </span>
        </div>

        <dl className="project-stats">
          <div><dt>チェック項目</dt><dd>{project.checklist.items.length}</dd></div>
          <div><dt>{terminology.referenceDocument}</dt><dd>{project.references.length}</dd></div>
          <div><dt>{terminology.projectDefaultRepairPolicy}</dt><dd>{repairPolicyLabel(project.defaultRepairPolicy)}</dd></div>
        </dl>

        <nav className="workspace-tabs" aria-label="編集する内容" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'overview'}
            className={activeSection === 'overview' ? 'active' : ''}
            onClick={() => onSectionChange('overview')}
            disabled={busy}
          >{terminology.overviewAndDocument}</button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'references'}
            className={activeSection === 'references' ? 'active' : ''}
            onClick={() => onSectionChange('references')}
            disabled={busy}
          >{terminology.referenceDocument} <span className="tab-count">{project.references.length}</span></button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'checklist'}
            className={activeSection === 'checklist' ? 'active' : ''}
            onClick={() => onSectionChange('checklist')}
            disabled={busy}
          >{terminology.checklist} <span className="tab-count">{project.checklist.items.length}</span></button>
        </nav>

        <div className="workspace-content" role="tabpanel">
          {activeSection === 'overview' ? (
            <section className="editor-section" aria-labelledby="overview-heading">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{terminology.overviewAndDocument}</p>
                  <h3 id="overview-heading">{terminology.overviewAndDocument}</h3>
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
                    <strong>{terminology.targetDocument}</strong>
                    <p>{project.target?.originalFileName ?? messages.targetNotSelected}</p>
                  </div>
                  <button type="button" className="secondary" onClick={onTargetSelect} disabled={busy}>
                    {actions.selectTargetDocument}
                  </button>
                </div>
              ) : project.generation ? (
                <GenerationSettingsForm generation={project.generation} disabled={busy} onChange={onGenerationChange} />
              ) : (
                <p className="empty-state">{messages.generationMissing}プロジェクトを作成し直してください。</p>
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
          <button type="button" onClick={() => onSave(false)} disabled={busy}>{actions.saveOverwrite}</button>
          <button type="button" className="secondary" onClick={() => onSave(true)} disabled={busy}>{actions.saveAs}</button>
          <button type="button" className="secondary" onClick={onValidate} disabled={busy}>{actions.runPreflight}</button>
          <button type="button" onClick={onExport} disabled={busy}>{actions.createCopilotPackage}</button>
        </div>
      </div>

      <aside className="panel validation-panel" aria-label="事前検査結果">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">{terminology.preflight}</p>
            <h2>{terminology.preflight}</h2>
          </div>
          <span className="issue-count">エラー {errorCount}件、警告 {warningCount}件</span>
        </div>
        {!preflightHasRun ? (
          <div className="empty-state">
            <p>{messages.preflightNotRun}</p>
            <p>{messages.preflightHelp}</p>
          </div>
        ) : issues.length === 0 ? (
          <p className="empty-state">{messages.preflightPassed}</p>
        ) : (
          <PreflightIssueList issues={issues} />
        )}
      </aside>
    </section>
  );
};
