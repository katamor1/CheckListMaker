import type { RepairPolicy } from '../shared/model.js';
import type { ConditionType } from './checklist-editor-model.js';

export const repairPolicyOptions: Array<{ value: RepairPolicy; label: string }> = [
  { value: 'auto_fix', label: '安全な場合は自動修正' },
  { value: 'suggest_only', label: '修正案のみ' },
  { value: 'do_not_modify', label: '変更・具体案を禁止' }
];

export const conditionTypeOptions: Array<{ value: ConditionType; label: string }> = [
  { value: 'semantic', label: '意味・内容' },
  { value: 'required_text', label: '必須語句' },
  { value: 'forbidden_text', label: '禁止語句' },
  { value: 'number', label: '数値' },
  { value: 'length_or_count', label: '文字数・件数' },
  { value: 'date_or_deadline', label: '日付・期限' },
  { value: 'pattern', label: '書式パターン' },
  { value: 'one_of', label: '許可値' },
  { value: 'cross_source_consistency', label: '参考資料整合性' }
];

export const setOptionalText = <T extends object>(value: T, key: string, text: string): T => {
  const next = { ...value } as Record<string, unknown>;
  if (text === '') delete next[key];
  else next[key] = text;
  return next as T;
};
