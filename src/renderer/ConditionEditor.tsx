import type { ConditionDefinition } from '../shared/model.js';
import { changeConditionType, type ConditionType } from './checklist-editor-model.js';
import { ConditionFields } from './ConditionFields.js';
import { conditionTypeOptions } from './condition-editor-options.js';
import type { ConditionReferenceOption } from './condition-editor-types.js';
import { ScopeEditor } from './ScopeEditor.js';

export type { ConditionReferenceOption } from './condition-editor-types.js';

export interface ConditionEditorProps {
  condition: ConditionDefinition;
  references: readonly ConditionReferenceOption[];
  disabled: boolean;
  onChange(condition: ConditionDefinition): void;
  onRemove(): void;
  onMoveUp(): void;
  onMoveDown(): void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

export const ConditionEditor = ({
  condition,
  references,
  disabled,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown
}: ConditionEditorProps) => {
  const remove = (): void => {
    const confirmed = typeof globalThis.confirm !== 'function' || globalThis.confirm('この条件を削除しますか？');
    if (confirmed) onRemove();
  };

  return (
    <article className="condition-card">
      <div className="editor-card-heading compact-heading">
        <div>
          <span className="id-badge">{condition.id}</span>
          <strong>{conditionTypeOptions.find((option) => option.value === condition.type)?.label}</strong>
        </div>
        <div className="inline-actions">
          <button type="button" className="secondary small" onClick={onMoveUp} disabled={disabled || !canMoveUp} aria-label={`${condition.id}を上へ移動`}>↑</button>
          <button type="button" className="secondary small" onClick={onMoveDown} disabled={disabled || !canMoveDown} aria-label={`${condition.id}を下へ移動`}>↓</button>
          <button type="button" className="danger small" onClick={remove} disabled={disabled}>条件を削除</button>
        </div>
      </div>

      <div className="form-grid two-column">
        <label className="field full-width">
          <span>条件タイプ</span>
          <select
            name={`condition-type-${condition.id}`}
            value={condition.type}
            onChange={(event) => onChange(changeConditionType(condition, event.currentTarget.value as ConditionType))}
            disabled={disabled}
          >
            {conditionTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>

        <ConditionFields
          condition={condition}
          references={references}
          disabled={disabled}
          onChange={onChange}
        />
      </div>

      <ScopeEditor
        conditionId={condition.id}
        scope={condition.scope}
        disabled={disabled}
        onChange={(scope) => onChange({ ...condition, scope } as ConditionDefinition)}
      />
    </article>
  );
};
