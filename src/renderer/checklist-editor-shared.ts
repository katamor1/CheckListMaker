import type { RepairPolicy } from '../shared/model.js';
import { conditionTypeLabels, repairPolicyLabels } from '../shared/presentation/ja/index.js';
import type { ConditionType } from './checklist-editor-model.js';

export const repairPolicyOptions: Array<{ value: RepairPolicy; label: string }> = [
  { value: 'auto_fix', label: repairPolicyLabels.auto_fix },
  { value: 'suggest_only', label: repairPolicyLabels.suggest_only },
  { value: 'do_not_modify', label: repairPolicyLabels.do_not_modify }
];

export const conditionTypeOptions: Array<{ value: ConditionType; label: string }> = [
  { value: 'semantic', label: conditionTypeLabels.semantic },
  { value: 'required_text', label: conditionTypeLabels.required_text },
  { value: 'forbidden_text', label: conditionTypeLabels.forbidden_text },
  { value: 'number', label: conditionTypeLabels.number },
  { value: 'length_or_count', label: conditionTypeLabels.length_or_count },
  { value: 'date_or_deadline', label: conditionTypeLabels.date_or_deadline },
  { value: 'pattern', label: conditionTypeLabels.pattern },
  { value: 'one_of', label: conditionTypeLabels.one_of },
  { value: 'cross_source_consistency', label: conditionTypeLabels.cross_source_consistency }
];

export const setOptionalText = <T extends object>(value: T, key: string, text: string): T => {
  const next = { ...value } as Record<string, unknown>;
  if (text === '') delete next[key];
  else next[key] = text;
  return next as T;
};
