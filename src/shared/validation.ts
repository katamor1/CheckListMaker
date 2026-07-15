import type { ConditionDefinition, ProjectDefinition, ValidationIssue } from './model.js';

const issue = (
  code: string,
  severity: ValidationIssue['severity'],
  section: ValidationIssue['section'],
  message: string,
  remediation: string,
  entityId?: string,
  field?: string
): ValidationIssue => ({
  code,
  severity,
  section,
  message,
  remediation,
  ...(entityId === undefined ? {} : { entityId }),
  ...(field === undefined ? {} : { field })
});

const nonEmpty = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

const validateCondition = (condition: ConditionDefinition, itemId: string, sourceIds: Set<string>): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const path = `${itemId}/${condition.id}`;
  if (!/^COND-[0-9]{2}$/.test(condition.id)) {
    issues.push(issue('CONDITION_ID_INVALID', 'error', 'checklist', '条件IDの形式が不正です。', '条件を作り直してください。', path, 'id'));
  }
  if (condition.scope.type === 'section' && !nonEmpty(condition.scope.heading)) {
    issues.push(issue('SCOPE_HEADING_REQUIRED', 'error', 'checklist', '章・見出しの指定が空です。', '対象となる見出しを入力してください。', path, 'scope.heading'));
  }
  if (condition.scope.type === 'table' && !nonEmpty(condition.scope.description)) {
    issues.push(issue('SCOPE_TABLE_REQUIRED', 'error', 'checklist', '対象表の説明が空です。', '対象表を特定できる説明を入力してください。', path, 'scope.description'));
  }
  if (condition.scope.type === 'semantic_locator' && !nonEmpty(condition.scope.description)) {
    issues.push(issue('SCOPE_LOCATOR_REQUIRED', 'error', 'checklist', '自然言語による対象範囲が空です。', '評価対象箇所の説明を入力してください。', path, 'scope.description'));
  }

  switch (condition.type) {
    case 'semantic':
      if (!nonEmpty(condition.instruction)) issues.push(issue('SEMANTIC_INSTRUCTION_REQUIRED', 'error', 'checklist', '意味判定の内容が空です。', '判断してほしい内容を入力してください。', path, 'instruction'));
      break;
    case 'required_text':
    case 'forbidden_text':
      if (condition.values.filter(nonEmpty).length === 0) issues.push(issue('TEXT_VALUES_REQUIRED', 'error', 'checklist', '語句が指定されていません。', '少なくとも1つの語句を入力してください。', path, 'values'));
      break;
    case 'number':
      if (!nonEmpty(condition.subject)) issues.push(issue('NUMBER_SUBJECT_REQUIRED', 'error', 'checklist', '確認する数値の名称が空です。', '数値の名称を入力してください。', path, 'subject'));
      if (condition.operator === 'between') {
        if (condition.minimum === undefined || condition.maximum === undefined || condition.minimum > condition.maximum) issues.push(issue('NUMBER_RANGE_INVALID', 'error', 'checklist', '数値範囲が不正です。', '最小値と最大値を正しい順で入力してください。', path, 'range'));
      } else if (condition.value === undefined) issues.push(issue('NUMBER_VALUE_REQUIRED', 'error', 'checklist', '比較値がありません。', '比較値を入力してください。', path, 'value'));
      break;
    case 'length_or_count':
      if (condition.operator === 'between') {
        if (condition.minimum === undefined || condition.maximum === undefined || condition.minimum > condition.maximum) issues.push(issue('COUNT_RANGE_INVALID', 'error', 'checklist', '件数・文字数の範囲が不正です。', '最小値と最大値を正しい順で入力してください。', path, 'range'));
      } else if (condition.value === undefined) issues.push(issue('COUNT_VALUE_REQUIRED', 'error', 'checklist', '件数・文字数の比較値がありません。', '比較値を入力してください。', path, 'value'));
      break;
    case 'date_or_deadline':
      if (!nonEmpty(condition.subject)) issues.push(issue('DATE_SUBJECT_REQUIRED', 'error', 'checklist', '確認する日付の名称が空です。', '日付の名称を入力してください。', path, 'subject'));
      if (condition.operator === 'between') {
        if (!condition.minimum || !condition.maximum || condition.minimum > condition.maximum) issues.push(issue('DATE_RANGE_INVALID', 'error', 'checklist', '日付範囲が不正です。', '開始日と終了日を正しい順で入力してください。', path, 'range'));
      } else if (!['exists', 'start_on_or_before_end'].includes(condition.operator) && !condition.value) issues.push(issue('DATE_VALUE_REQUIRED', 'error', 'checklist', '基準日がありません。', '基準日を入力してください。', path, 'value'));
      break;
    case 'pattern':
      if (!nonEmpty(condition.pattern)) issues.push(issue('PATTERN_REQUIRED', 'error', 'checklist', '書式パターンが空です。', 'プリセットを選ぶか正規表現を入力してください。', path, 'pattern'));
      else {
        try { new RegExp(condition.pattern); } catch { issues.push(issue('PATTERN_INVALID', 'error', 'checklist', '正規表現を解釈できません。', 'パターンを修正してください。', path, 'pattern')); }
      }
      break;
    case 'one_of':
      if (!nonEmpty(condition.subject) || condition.allowedValues.filter(nonEmpty).length === 0) issues.push(issue('ONE_OF_VALUES_REQUIRED', 'error', 'checklist', '選択肢条件が未設定です。', '確認対象と許可値を入力してください。', path));
      break;
    case 'cross_source_consistency':
      if (!nonEmpty(condition.instruction)) issues.push(issue('CONSISTENCY_INSTRUCTION_REQUIRED', 'error', 'checklist', '整合性の確認内容が空です。', '照合内容を入力してください。', path, 'instruction'));
      for (const sourceId of condition.sourceIds) if (!sourceIds.has(sourceId)) issues.push(issue('REFERENCE_ID_UNKNOWN', 'error', 'checklist', `参考資料 ${sourceId} が存在しません。`, '存在する参考資料を選択してください。', path, 'sourceIds'));
      break;
  }
  return issues;
};

export const validateProject = (project: ProjectDefinition): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(project.name)) issues.push(issue('PROJECT_NAME_REQUIRED', 'error', 'overview', 'プロジェクト名が空です。', 'プロジェクト名を入力してください。', undefined, 'name'));
  if (project.mode === 'existing_document' && !project.target) issues.push(issue('TARGET_REQUIRED', 'error', 'document', '主対象文書がありません。', 'MD、TXT、DOCXまたはPDFを選択してください。'));
  if (project.mode === 'document_generation') {
    if (!project.generation) issues.push(issue('GENERATION_REQUIRED', 'error', 'generation', '文書生成設定がありません。', '文書生成の目的、読者、指示を入力してください。'));
    else {
      if (!nonEmpty(project.generation.title)) issues.push(issue('GENERATION_TITLE_REQUIRED', 'error', 'generation', '生成文書の題名が空です。', '題名を入力してください.', undefined, 'title'));
      if (!nonEmpty(project.generation.instructions)) issues.push(issue('GENERATION_INSTRUCTIONS_REQUIRED', 'error', 'generation', '文書生成指示が空です。', '生成してほしい内容を入力してください。', undefined, 'instructions'));
    }
  }
  if (project.target?.format === 'pdf' && project.defaultRepairPolicy === 'auto_fix') issues.push(issue('PDF_AUTOFIX_WARNING', 'warning', 'document', 'PDFは評価のみで、自動修正できません。', '既定方針を修正案のみへ変更するか、警告を確認してください。'));

  const referenceIds = new Set<string>();
  for (const reference of project.references) {
    if (referenceIds.has(reference.id)) issues.push(issue('REFERENCE_ID_DUPLICATE', 'error', 'references', `参考資料ID ${reference.id} が重複しています。`, '重複しないIDになるよう資料を追加し直してください。', reference.id));
    referenceIds.add(reference.id);
    if (reference.priority < 0 || reference.priority > 100) issues.push(issue('REFERENCE_PRIORITY_INVALID', 'error', 'references', '優先順位は0から100の範囲です。', '優先順位を修正してください。', reference.id, 'priority'));
  }

  const itemIds = new Set<string>();
  const conditionIds = new Set<string>();
  for (const item of project.checklist.items) {
    if (!/^CHK-[0-9]{4}$/.test(item.id)) issues.push(issue('CHECK_ITEM_ID_INVALID', 'error', 'checklist', `チェック項目ID ${item.id} の形式が不正です。`, '項目を作り直してください。', item.id, 'id'));
    if (itemIds.has(item.id)) issues.push(issue('CHECK_ITEM_ID_DUPLICATE', 'error', 'checklist', `チェック項目ID ${item.id} が重複しています。`, '重複項目を削除してください。', item.id, 'id'));
    itemIds.add(item.id);
    if (!nonEmpty(item.title)) issues.push(issue('CHECK_ITEM_TITLE_REQUIRED', 'error', 'checklist', 'チェック項目名が空です。', '項目名を入力してください。', item.id, 'title'));
    if (item.conditions.length === 0) issues.push(issue('CONDITION_GROUP_EMPTY', 'error', 'checklist', 'チェック項目に条件がありません。', '少なくとも1件の条件を追加してください。', item.id, 'conditions'));
    if (item.required && item.allowNotApplicable) issues.push(issue('REQUIRED_ITEM_NA_WARNING', 'warning', 'checklist', '必須項目で対象外を許可しています。', '意図した設定か確認してください。', item.id, 'allowNotApplicable'));
    for (const condition of item.conditions) {
      if (conditionIds.has(condition.id)) issues.push(issue('CONDITION_ID_DUPLICATE', 'error', 'checklist', `条件ID ${condition.id} が重複しています。`, '条件を作り直してください。', item.id, condition.id));
      conditionIds.add(condition.id);
      issues.push(...validateCondition(condition, item.id, referenceIds));
    }
  }

  const authorityKeys = new Set<string>();
  for (const reference of project.references) {
    const key = `${reference.authorityLevel}:${reference.priority}`;
    if (authorityKeys.has(key)) issues.push(issue('REFERENCE_PRECEDENCE_TIE', 'warning', 'references', '同じ権威レベル・優先順位の資料があります。', '矛盾時に判断不能になるため優先順位を見直してください。', reference.id));
    authorityKeys.add(key);
  }

  return issues.sort((left, right) => {
    const severity = left.severity === right.severity ? 0 : left.severity === 'error' ? -1 : 1;
    return severity || left.section.localeCompare(right.section) || (left.entityId ?? '').localeCompare(right.entityId ?? '') || left.code.localeCompare(right.code);
  });
};
