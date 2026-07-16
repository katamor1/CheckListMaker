import { conditionTypeLabels, scopeTypeLabels } from '../shared/presentation/ja/index.js';
import type { ConditionType, ScopeType } from './checklist-editor-model.js';

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

export const scopeTypeOptions: Array<{ value: ScopeType; label: string }> = [
  { value: 'entire_document', label: scopeTypeLabels.entire_document },
  { value: 'section', label: scopeTypeLabels.section },
  { value: 'table', label: scopeTypeLabels.table },
  { value: 'semantic_locator', label: scopeTypeLabels.semantic_locator }
];

export const numberOperatorOptions = [
  ['equal', '等しい'],
  ['not_equal', '等しくない'],
  ['less_than', 'より小さい'],
  ['less_than_or_equal', '以下'],
  ['greater_than', 'より大きい'],
  ['greater_than_or_equal', '以上'],
  ['between', '範囲内']
] as const;

export const countOperatorOptions = [
  ['equal', '等しい'],
  ['less_than_or_equal', '以下'],
  ['greater_than_or_equal', '以上'],
  ['between', '範囲内']
] as const;

export const dateOperatorOptions = [
  ['exists', '日付が存在する'],
  ['on', '指定日と同じ'],
  ['before', '指定日より前'],
  ['on_or_before', '指定日以前'],
  ['after', '指定日より後'],
  ['on_or_after', '指定日以後'],
  ['between', '期間内'],
  ['start_on_or_before_end', '開始日が終了日以前']
] as const;
