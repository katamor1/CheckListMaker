import type { AuthorityLevel, ReferenceRoleDefinition } from '../shared/model.js';
import { setOptionalText } from './checklist-editor-shared.js';

const nextRoleId = (roles: readonly ReferenceRoleDefinition[]): string => {
  const used = new Set(roles.map((role) => role.roleId));
  for (let value = 1; value < 1000; value += 1) {
    const candidate = `ROLE-${String(value).padStart(3, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('ROLE IDをこれ以上発行できません。');
};

interface ReferenceRoleEditorProps {
  roles: readonly ReferenceRoleDefinition[];
  disabled: boolean;
  onChange(roles: ReferenceRoleDefinition[]): void;
}

export const ReferenceRoleEditor = ({ roles, disabled, onChange }: ReferenceRoleEditorProps) => {
  const add = (): void => {
    onChange([...roles, {
      roleId: nextRoleId(roles),
      name: '新しい参考資料ロール',
      required: false,
      recommendedAuthorityLevel: 'approved'
    }]);
  };

  const update = (
    roleId: string,
    change: (role: ReferenceRoleDefinition) => ReferenceRoleDefinition
  ): void => onChange(roles.map((role) => role.roleId === roleId ? change(role) : role));

  const remove = (roleId: string): void => {
    const confirmed = typeof globalThis.confirm !== 'function' || globalThis.confirm('この参考資料ロールを削除しますか？');
    if (confirmed) onChange(roles.filter((role) => role.roleId !== roleId));
  };

  return (
    <details className="role-editor">
      <summary>参考資料ロール（{roles.length}件）</summary>
      <p className="section-help">必須となる資料の役割を定義し、「参考資料」タブで実ファイルへ割り当てます。</p>
      <div className="actions compact-actions">
        <button type="button" className="secondary" onClick={add} disabled={disabled}>ロールを追加</button>
      </div>
      {roles.length === 0 ? (
        <p className="empty-state compact">参考資料ロールは定義されていません。</p>
      ) : (
        <div className="editor-stack compact-stack">
          {roles.map((role) => (
            <article className="role-card" key={role.roleId}>
              <div className="editor-card-heading compact-heading">
                <span className="id-badge">{role.roleId}</span>
                <button type="button" className="danger small" onClick={() => remove(role.roleId)} disabled={disabled}>削除</button>
              </div>
              <div className="form-grid two-column">
                <label className="field">
                  <span>ロール名</span>
                  <input
                    name={`reference-role-name-${role.roleId}`}
                    value={role.name}
                    onChange={(event) => update(role.roleId, (current) => ({ ...current, name: event.currentTarget.value }))}
                    disabled={disabled}
                  />
                </label>
                <label className="field">
                  <span>推奨権威レベル</span>
                  <select
                    name={`reference-role-authority-${role.roleId}`}
                    value={role.recommendedAuthorityLevel}
                    onChange={(event) => update(role.roleId, (current) => ({
                      ...current,
                      recommendedAuthorityLevel: event.currentTarget.value as AuthorityLevel
                    }))}
                    disabled={disabled}
                  >
                    <option value="binding">binding</option>
                    <option value="approved">approved</option>
                    <option value="working">working</option>
                    <option value="reference">reference</option>
                  </select>
                </label>
                <label className="field full-width">
                  <span>説明（任意）</span>
                  <input
                    name={`reference-role-description-${role.roleId}`}
                    value={role.description ?? ''}
                    onChange={(event) => update(role.roleId, (current) => setOptionalText(current, 'description', event.currentTarget.value))}
                    disabled={disabled}
                  />
                </label>
                <label className="checkbox-field full-width">
                  <input
                    type="checkbox"
                    name={`reference-role-required-${role.roleId}`}
                    checked={role.required}
                    onChange={(event) => update(role.roleId, (current) => ({ ...current, required: event.currentTarget.checked }))}
                    disabled={disabled}
                  />
                  <span>このロールの資料を必須にする</span>
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
    </details>
  );
};
