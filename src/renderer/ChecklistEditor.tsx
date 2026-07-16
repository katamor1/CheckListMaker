import type { ChecklistDefinition, RepairPolicy } from '../shared/model.js';
import { actions, messages, terminology } from '../shared/presentation/ja/index.js';
import { addCheckItem } from './checklist-editor-model.js';
import { setOptionalText, repairPolicyOptions } from './checklist-editor-shared.js';
import type { ConditionReferenceOption } from './ConditionEditor.js';
import { CheckItemEditor } from './CheckItemEditor.js';
import { ReferenceRoleEditor } from './ReferenceRoleEditor.js';

export interface ChecklistEditorProps {
  checklist: ChecklistDefinition;
  defaultRepairPolicy: RepairPolicy;
  references: readonly ConditionReferenceOption[];
  disabled: boolean;
  onChecklistChange(checklist: ChecklistDefinition): void;
  onDefaultRepairPolicyChange(policy: RepairPolicy): void;
}

export const ChecklistEditor = ({
  checklist,
  defaultRepairPolicy,
  references,
  disabled,
  onChecklistChange,
  onDefaultRepairPolicyChange
}: ChecklistEditorProps) => (
  <section className="editor-section" aria-labelledby="checklist-heading">
    <div className="section-heading">
      <div>
        <p className="eyebrow">{terminology.checklist}</p>
        <h3 id="checklist-heading">{terminology.checklist}</h3>
        <p className="section-help">項目内の条件は一段階のANDまたはORで結合します。条件と評価対象範囲は種類ごとに設定できます。</p>
      </div>
      <button type="button" onClick={() => onChecklistChange(addCheckItem(checklist))} disabled={disabled}>{actions.addChecklistItem}</button>
    </div>

    <div className="form-grid two-column checklist-metadata">
      <label className="field">
        <span>チェックリスト名</span>
        <input
          name="checklist-name"
          value={checklist.name}
          onChange={(event) => onChecklistChange({ ...checklist, name: event.currentTarget.value })}
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>{terminology.projectDefaultRepairPolicy}</span>
        <select
          name="default-repair-policy"
          value={defaultRepairPolicy}
          onChange={(event) => onDefaultRepairPolicyChange(event.currentTarget.value as RepairPolicy)}
          disabled={disabled}
        >
          {repairPolicyOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="field full-width">
        <span>説明（任意）</span>
        <textarea
          name="checklist-description"
          value={checklist.description ?? ''}
          onChange={(event) => onChecklistChange(setOptionalText(checklist, 'description', event.currentTarget.value))}
          rows={3}
          disabled={disabled}
        />
      </label>
    </div>

    <ReferenceRoleEditor
      roles={checklist.requiredReferenceRoles}
      disabled={disabled}
      onChange={(requiredReferenceRoles) => onChecklistChange({ ...checklist, requiredReferenceRoles })}
    />

    {checklist.items.length === 0 ? (
      <p className="empty-state">{messages.checklistItemsEmpty}1件以上追加してください。</p>
    ) : (
      <div className="editor-stack checklist-stack">
        {checklist.items.map((item, itemIndex) => (
          <CheckItemEditor
            key={item.id}
            checklist={checklist}
            item={item}
            itemIndex={itemIndex}
            references={references}
            disabled={disabled}
            onChange={onChecklistChange}
          />
        ))}
      </div>
    )}
  </section>
);
