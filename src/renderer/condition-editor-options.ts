import type { ConditionType, ScopeType } from './checklist-editor-model.js';

export const conditionTypeOptions: Array<{ value: ConditionType; label: string }> = [
  { value: 'semantic', label: '意味・内容を判断' },
  { value: 'required_text', label: '必須語句' },
  { value: 'forbidden_text', label: '禁止語句' },
  { value: 'number', label: '数値' },
  { value: 'length_or_count', label: '文字数・件数' },
  { value: 'date_or_deadline', label: '日付・期限' },
  { value: 'pattern', label: '書式パターン' },
  { value: 'one_of', label: '許可値のいずれか' },
  { value: 'cross_source_consistency', label: '参考資料との整合性' }
];

export const scopeTypeOptions: Array<{ value: ScopeType; label: string }> = [
  { value: 'entire_document', label: '文書全体' },
  { value: 'section', label: '章・見出し' },
  { value: 'table', label: '表' },
  { value: 'semantic_locator', label: '自然言語で指定した箇所' }
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
