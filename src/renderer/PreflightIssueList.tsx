import type { ValidationIssue } from '../shared/model.js';
import { actions, statuses } from '../shared/presentation/ja/index.js';

const sectionLabels: Record<ValidationIssue['section'], string> = {
  overview: 'プロジェクト',
  document: '主対象文書',
  references: '参考資料',
  checklist: 'チェックリスト',
  generation: '文書生成設定',
  package: 'Copilot用ZIP'
};

export const PreflightIssueList = ({ issues }: { issues: readonly ValidationIssue[] }) => (
  <ul className="issue-list">
    {issues.map((issue, index) => (
      <li key={`${issue.code}-${index}`} className={issue.severity}>
        <span className="issue-severity">
          {issue.severity === 'error' ? statuses.error : statuses.warning}
        </span>
        <strong>{issue.message}</strong>
        <span>{issue.remediation}</span>
        <details className="issue-details">
          <summary>
            <span className="details-closed-label">{actions.showDetails}</span>
            <span className="details-open-label">{actions.hideDetails}</span>
          </summary>
          <dl>
            <div><dt>エラーコード</dt><dd><code>{issue.code}</code></dd></div>
            <div><dt>対象画面</dt><dd>{sectionLabels[issue.section]}</dd></div>
            {issue.entityId ? <div><dt>対象ID</dt><dd><code>{issue.entityId}</code></dd></div> : null}
            {issue.field ? <div><dt>対象項目</dt><dd><code>{issue.field}</code></dd></div> : null}
          </dl>
        </details>
      </li>
    ))}
  </ul>
);
