import type {
  AuthorityLevel,
  ReferenceDocumentDefinition,
  ReferenceRoleDefinition
} from '../shared/model.js';
import { removeReference, updateReference } from './reference-editor-model.js';

export interface ReferenceEditorProps {
  references: readonly ReferenceDocumentDefinition[];
  roles: readonly ReferenceRoleDefinition[];
  disabled: boolean;
  onAdd(): void;
  onChange(references: ReferenceDocumentDefinition[]): void;
}

const authorityOptions: Array<{ value: AuthorityLevel; label: string }> = [
  { value: 'binding', label: '拘束力あり (binding)' },
  { value: 'approved', label: '承認済み (approved)' },
  { value: 'working', label: '作業資料 (working)' },
  { value: 'reference', label: '参考 (reference)' }
];

const updateEffectiveDate = (
  reference: ReferenceDocumentDefinition,
  value: string
): ReferenceDocumentDefinition => {
  const { effectiveDate: _discarded, ...withoutDate } = reference;
  return value ? { ...withoutDate, effectiveDate: value } : withoutDate;
};

export const ReferenceEditor = ({
  references,
  roles,
  disabled,
  onAdd,
  onChange
}: ReferenceEditorProps) => {
  const change = (
    referenceId: string,
    update: (reference: ReferenceDocumentDefinition) => ReferenceDocumentDefinition
  ): void => onChange(updateReference(references, referenceId, update));

  const remove = (referenceId: string): void => {
    const confirmed = typeof globalThis.confirm !== 'function' || globalThis.confirm('この参考資料をプロジェクトから削除しますか？');
    if (confirmed) onChange(removeReference(references, referenceId));
  };

  return (
    <section className="editor-section" aria-labelledby="references-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">REFERENCES</p>
          <h3 id="references-heading">参考資料</h3>
          <p className="section-help">文書は読み取り専用で登録され、権威レベルと優先順位の順に解決されます。</p>
        </div>
        <button type="button" onClick={onAdd} disabled={disabled}>参考資料を追加</button>
      </div>

      {references.length === 0 ? (
        <p className="empty-state">参考資料はまだありません。MD、TXT、DOCX、PDFを複数選択できます。</p>
      ) : (
        <div className="editor-stack">
          {references.map((reference) => (
            <article className="editor-card reference-card" key={reference.id}>
              <div className="editor-card-heading">
                <div>
                  <span className="id-badge">{reference.id}</span>
                  <h4>{reference.title || reference.document.originalFileName}</h4>
                  <p className="file-summary">
                    {reference.document.originalFileName}
                    {' · '}
                    {reference.document.format === 'pdf' ? 'PDF・評価のみ' : `${reference.document.format.toUpperCase()}・評価と条件付き修正`}
                  </p>
                </div>
                <button type="button" className="danger small" onClick={() => remove(reference.id)} disabled={disabled}>削除</button>
              </div>

              <div className="form-grid two-column">
                <label className="field">
                  <span>表示名</span>
                  <input
                    name={`reference-title-${reference.id}`}
                    value={reference.title}
                    onChange={(event) => change(reference.id, (current) => ({ ...current, title: event.currentTarget.value }))}
                    disabled={disabled}
                  />
                </label>

                <label className="field">
                  <span>用途</span>
                  <input
                    name={`reference-purpose-${reference.id}`}
                    value={reference.purpose}
                    onChange={(event) => change(reference.id, (current) => ({ ...current, purpose: event.currentTarget.value }))}
                    placeholder="例: 必須品質規則と禁止事項"
                    disabled={disabled}
                  />
                </label>

                <label className="field">
                  <span>権威レベル</span>
                  <select
                    name={`reference-authority-${reference.id}`}
                    value={reference.authorityLevel}
                    onChange={(event) => change(reference.id, (current) => ({
                      ...current,
                      authorityLevel: event.currentTarget.value as AuthorityLevel
                    }))}
                    disabled={disabled}
                  >
                    {authorityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>

                <label className="field">
                  <span>優先順位（0～100）</span>
                  <input
                    name={`reference-priority-${reference.id}`}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={reference.priority}
                    onChange={(event) => change(reference.id, (current) => ({
                      ...current,
                      priority: Number(event.currentTarget.value)
                    }))}
                    disabled={disabled}
                  />
                </label>

                <label className="field">
                  <span>有効日（任意）</span>
                  <input
                    name={`reference-effective-date-${reference.id}`}
                    type="date"
                    value={reference.effectiveDate ?? ''}
                    onChange={(event) => change(reference.id, (current) => updateEffectiveDate(current, event.currentTarget.value))}
                    disabled={disabled}
                  />
                </label>
              </div>

              <fieldset className="compact-fieldset">
                <legend>参考資料ロール</legend>
                {roles.length === 0 ? (
                  <p className="empty-state compact">チェックリストに参考資料ロールは定義されていません。</p>
                ) : (
                  <div className="checkbox-grid">
                    {roles.map((role) => {
                      const checked = reference.roleIds.includes(role.roleId);
                      return (
                        <label className="checkbox-field" key={role.roleId}>
                          <input
                            type="checkbox"
                            name={`reference-role-${reference.id}-${role.roleId}`}
                            checked={checked}
                            onChange={(event) => change(reference.id, (current) => ({
                              ...current,
                              roleIds: event.currentTarget.checked
                                ? [...current.roleIds, role.roleId]
                                : current.roleIds.filter((roleId) => roleId !== role.roleId)
                            }))}
                            disabled={disabled}
                          />
                          <span>{role.name}{role.required ? '（必須）' : ''}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
