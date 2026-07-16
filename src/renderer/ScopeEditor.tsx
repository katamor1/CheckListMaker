import type { NotFoundBehavior, ScopeDefinition } from '../shared/model.js';
import { changeScopeType, type ScopeType } from './checklist-editor-model.js';
import { scopeTypeOptions } from './condition-editor-options.js';

export interface ScopeEditorProps {
  conditionId: string;
  scope: ScopeDefinition;
  disabled: boolean;
  onChange(scope: ScopeDefinition): void;
}

const linesToValues = (value: string): string[] =>
  value.split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);

export const ScopeEditor = ({ conditionId, scope, disabled, onChange }: ScopeEditorProps) => (
  <fieldset className="compact-fieldset scope-editor">
    <legend>評価対象範囲</legend>
    <div className="form-grid two-column">
      <label className="field">
        <span>範囲の種類</span>
        <select
          name={`condition-scope-${conditionId}`}
          value={scope.type}
          onChange={(event) => onChange(changeScopeType(scope, event.currentTarget.value as ScopeType))}
          disabled={disabled}
        >
          {scopeTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>

      <label className="field">
        <span>指定した範囲が見つからない場合</span>
        <select
          name={`condition-on-not-found-${conditionId}`}
          value={scope.onNotFound}
          onChange={(event) => onChange({
            ...scope,
            onNotFound: event.currentTarget.value as NotFoundBehavior
          })}
          disabled={disabled}
        >
          <option value="invalid">不適合にする</option>
          <option value="needs_information">確認が必要な状態にする</option>
        </select>
      </label>

      {scope.type === 'section' ? (
        <>
          <label className="field">
            <span>対象の見出し</span>
            <input
              name={`condition-scope-heading-${conditionId}`}
              value={scope.heading}
              onChange={(event) => onChange({ ...scope, heading: event.currentTarget.value })}
              placeholder="例: 2. 適用範囲"
              disabled={disabled}
            />
          </label>
          <label className="field">
            <span>見出しの照合方法</span>
            <select
              name={`condition-scope-heading-mode-${conditionId}`}
              value={scope.matchMode}
              onChange={(event) => onChange({
                ...scope,
                matchMode: event.currentTarget.value as 'exact' | 'semantic'
              })}
              disabled={disabled}
            >
              <option value="exact">完全一致</option>
              <option value="semantic">意味が近い見出しを許可</option>
            </select>
          </label>
          <label className="checkbox-field full-width">
            <input
              type="checkbox"
              name={`condition-scope-include-subsections-${conditionId}`}
              checked={scope.includeSubsections}
              onChange={(event) => onChange({ ...scope, includeSubsections: event.currentTarget.checked })}
              disabled={disabled}
            />
            <span>配下の小見出しも含める</span>
          </label>
        </>
      ) : null}

      {scope.type === 'table' ? (
        <>
          <label className="field full-width">
            <span>対象表の説明</span>
            <input
              name={`condition-scope-table-description-${conditionId}`}
              value={scope.description}
              onChange={(event) => onChange({ ...scope, description: event.currentTarget.value })}
              placeholder="例: 主要パラメータ表"
              disabled={disabled}
            />
          </label>
          <label className="field full-width">
            <span>必要な列名（1行に1件）</span>
            <textarea
              name={`condition-scope-table-columns-${conditionId}`}
              value={scope.expectedColumns.join('\n')}
              onChange={(event) => onChange({ ...scope, expectedColumns: linesToValues(event.currentTarget.value) })}
              rows={3}
              disabled={disabled}
            />
          </label>
        </>
      ) : null}

      {scope.type === 'semantic_locator' ? (
        <label className="field full-width">
          <span>評価対象箇所の説明</span>
          <textarea
            name={`condition-scope-locator-${conditionId}`}
            value={scope.description}
            onChange={(event) => onChange({ ...scope, description: event.currentTarget.value })}
            placeholder="例: 監視周期と用語定義について記載された箇所"
            rows={3}
            disabled={disabled}
          />
        </label>
      ) : null}
    </div>
  </fieldset>
);
