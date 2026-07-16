export const terminology = Object.freeze({
  productDescriptor: '文書検証パッケージ作成ツール',
  project: 'プロジェクト',
  checklist: 'チェックリスト',
  referenceDocument: '参考資料',
  targetDocument: '主対象文書',
  generationSettings: '文書生成設定',
  preflight: '事前検査',
  overviewAndDocument: '概要・文書',
  versionInformation: 'バージョン情報',
  documentTitle: '文書タイトル',
  intendedAudience: '想定読者',
  documentPurpose: '文書の目的',
  documentLanguage: '文書の言語',
  outputFormat: '生成するファイル形式',
  generationInstructions: '文書生成指示',
  projectDefaultRepairPolicy: 'プロジェクトの既定修正方針',
  referencePriority: '同一権威レベル内の優先順位'
} as const);

export const authorityLevelLabels = Object.freeze({
  binding: '拘束力あり（binding）',
  approved: '承認済み（approved）',
  working: '作業中（working）',
  reference: '参考（reference）'
} as const);

export const repairPolicyLabels = Object.freeze({
  auto_fix: '安全な場合は自動修正',
  suggest_only: '修正案のみ',
  do_not_modify: '変更・具体案を禁止'
} as const);

export const conditionTypeLabels = Object.freeze({
  semantic: '意味・内容を判断',
  required_text: '必須語句',
  forbidden_text: '禁止語句',
  number: '数値',
  length_or_count: '文字数・件数',
  date_or_deadline: '日付・期限',
  pattern: '書式パターン',
  one_of: '許可値のいずれか',
  cross_source_consistency: '参考資料との整合性'
} as const);

export const scopeTypeLabels = Object.freeze({
  entire_document: '文書全体',
  section: '章・見出し',
  table: '表',
  semantic_locator: '自然言語で指定した箇所'
} as const);
