import { useState } from 'react';
import type { ChecklistDefinition, CheckItemDefinition, ConditionDefinition, RepairPolicy } from '../shared/model.js';
import { actions } from '../shared/presentation/ja/index.js';
import {
  addCondition,
  duplicateCheckItem,
  moveCheckItem,
  moveCondition,
  removeCheckItem,
  removeCondition,
  updateCheckItem,
  updateCondition,
  type ConditionType
} from './checklist-editor-model.js';
import { ConditionEditor, type ConditionReferenceOption } from './ConditionEditor.js';
import { conditionTypeOptions, repairPolicyOptions, setOptionalText } from './checklist-editor-shared.js';

interface CheckItemEditorProps {
  checklist: ChecklistDefinition;
  item: CheckItemDefinition;
  itemIndex: number;
  references: readonly ConditionReferenceOption[];
  disabled: boolean;
  onChange(checklist: ChecklistDefinition): void;
}

export const CheckItemEditor = ({
  checklist,
  item,
  itemIndex,
  references,
  disabled,
  onChange
}: CheckItemEditorProps) => {
  const [newConditionType, setNewConditionType] = useState<ConditionType>('semantic');
  const changeItem = (change: (current: CheckItemDefinition) => CheckItemDefinition): void => {
    onChange(updateCheckItem(checklist, item.id, change));
  };
  const removeItem = (): void => {
    const confirmed = typeof globalThis.confirm !== 'function' || globalThis.confirm('このチェック項目と、項目に含まれる条件を削除しますか？');
    if (confirmed) onChange(removeCheckItem(checklist, item.id));
  };

  const setItemRepairPolicy = (value: string): void => {
    changeItem((current) => {
      const { repairPolicy: _discarded, ...withoutPolicy } = current;
      return value === 'inherit'
        ? withoutPolicy
        : { ...withoutPolicy, repairPolicy: value as RepairPolicy };
    });
  };

  return (
    <article className="editor-card check-item-card">
      <div className="editor-card-heading">
        <div>
          <span className="id-badge">{item.id}</span>
          <h4>{item.title || 'チェック項目名が入力されていません'}</h4>
          <p className="file-summary">条件 {item.conditions.length}件 · {item.required ? '必須項目' : '任意項目'}</p>
        </div>
        <div className="inline-actions">
          <button type="button" className="secondary small" onClick={() => onChange(moveCheckItem(checklist, item.id, -1))} disabled={disabled || itemIndex === 0} aria-label={`${item.id}を上へ移動`}>↑</button>
          <button type="button" className="secondary small" onClick={() => onChange(moveCheckItem(checklist, item.id, 1))} disabled={disabled || itemIndex === checklist.items.length - 1} aria-label={`${item.id}を下へ移動`}>↓</button>
          <button type="button" className="secondary small" onClick={() => onChange(duplicateCheckItem(checklist, item.id))} disabled={disabled}>{actions.duplicate}</button>
          <button type="button" className="danger small" onClick={removeItem} disabled={disabled}>{actions.deleteItem}</button>
        </div>
      </div>

      <div className="form-grid two-column">
        <label className="field">
          <span>チェック項目名</span>
          <input
            name={`item-title-${item.id}`}
            value={item.title}
            onChange={(event) => changeItem((current) => ({ ...current, title: event.currentTarget.value }))}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>条件の結合方法</span>
          <select
            name={`item-logic-${item.id}`}
            value={item.conditionLogic}
            onChange={(event) => changeItem((current) => ({
              ...current,
              conditionLogic: event.currentTarget.value as 'all' | 'any'
            }))}
            disabled={disabled}
          >
            <option value="all">すべて満たす（AND）</option>
            <option value="any">いずれか満たす（OR）</option>
          </select>
        </label>
        <label className="field full-width">
          <span>説明（任意）</span>
          <textarea
            name={`item-description-${item.id}`}
            value={item.description ?? ''}
            onChange={(event) => changeItem((current) => setOptionalText(current, 'description', event.currentTarget.value))}
            rows={2}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>この項目の修正方針</span>
          <select
            name={`item-repair-policy-${item.id}`}
            value={item.repairPolicy ?? 'inherit'}
            onChange={(event) => setItemRepairPolicy(event.currentTarget.value)}
            disabled={disabled}
          >
            <option value="inherit">プロジェクトの既定修正方針を継承</option>
            {repairPolicyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <div className="checkbox-group">
          <label className="checkbox-field">
            <input
              type="checkbox"
              name={`item-required-${item.id}`}
              checked={item.required}
              onChange={(event) => changeItem((current) => ({ ...current, required: event.currentTarget.checked }))}
              disabled={disabled}
            />
            <span>必須項目</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              name={`item-allow-na-${item.id}`}
              checked={item.allowNotApplicable}
              onChange={(event) => changeItem((current) => ({ ...current, allowNotApplicable: event.currentTarget.checked }))}
              disabled={disabled}
            />
            <span>対象外を許可</span>
          </label>
        </div>
        <label className="field full-width">
          <span>Copilotへの補足（任意）</span>
          <textarea
            name={`item-notes-${item.id}`}
            value={item.notes ?? ''}
            onChange={(event) => changeItem((current) => setOptionalText(current, 'notes', event.currentTarget.value))}
            rows={2}
            disabled={disabled}
          />
        </label>
      </div>

      <section className="conditions-section" aria-label={`${item.id}の条件一覧`}>
        <div className="section-heading compact-heading">
          <div>
            <h5>条件</h5>
            <p className="section-help">条件IDは自動採番され、削除後は再利用されません。</p>
          </div>
          <div className="condition-add-controls">
            <label className="visually-grouped">
              <span className="visually-hidden">追加する条件の種類</span>
              <select
                name={`new-condition-type-${item.id}`}
                value={newConditionType}
                onChange={(event) => setNewConditionType(event.currentTarget.value as ConditionType)}
                disabled={disabled}
              >
                {conditionTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="button" className="secondary" onClick={() => onChange(addCondition(checklist, item.id, newConditionType))} disabled={disabled}>{actions.addCondition}</button>
          </div>
        </div>

        {item.conditions.length === 0 ? (
          <p className="empty-state">条件が登録されていません。1件以上追加してください。</p>
        ) : (
          <div className="condition-stack">
            {item.conditions.map((condition: ConditionDefinition, conditionIndex) => (
              <ConditionEditor
                key={condition.id}
                condition={condition}
                references={references}
                disabled={disabled}
                onChange={(nextCondition) => onChange(updateCondition(checklist, item.id, condition.id, () => nextCondition))}
                onRemove={() => onChange(removeCondition(checklist, item.id, condition.id))}
                onMoveUp={() => onChange(moveCondition(checklist, item.id, condition.id, -1))}
                onMoveDown={() => onChange(moveCondition(checklist, item.id, condition.id, 1))}
                canMoveUp={conditionIndex > 0}
                canMoveDown={conditionIndex < item.conditions.length - 1}
              />
            ))}
          </div>
        )}
      </section>
    </article>
  );
};
