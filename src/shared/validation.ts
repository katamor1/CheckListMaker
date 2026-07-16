import type { ConditionDefinition, ProjectDefinition, ValidationIssue } from './model.js';
import { presentationForValidationCode } from './presentation/ja/index.js';

const issueForCode = (
  code: string,
  severity: ValidationIssue['severity'],
  section: ValidationIssue['section'],
  entityId?: string,
  field?: string
): ValidationIssue => {
  const presentation = presentationForValidationCode(code, {
    title: '入力内容を確認してください。',
    remediation: '設定を見直してください。'
  });
  return {
    code,
    severity,
    section,
    message: presentation.title,
    remediation: presentation.remediation,
    ...(entityId === undefined ? {} : { entityId }),
    ...(field === undefined ? {} : { field })
  };
};

const nonEmpty = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

const validateCondition = (condition: ConditionDefinition, itemId: string, sourceIds: Set<string>): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const path = `${itemId}/${condition.id}`;
  if (!/^COND-[0-9]{2}$/.test(condition.id)) {
    issues.push(issueForCode('CONDITION_ID_INVALID', 'error', 'checklist', path, 'id'));
  }
  if (condition.scope.type === 'section' && !nonEmpty(condition.scope.heading)) {
    issues.push(issueForCode('SCOPE_HEADING_REQUIRED', 'error', 'checklist', path, 'scope.heading'));
  }
  if (condition.scope.type === 'table' && !nonEmpty(condition.scope.description)) {
    issues.push(issueForCode('SCOPE_TABLE_REQUIRED', 'error', 'checklist', path, 'scope.description'));
  }
  if (condition.scope.type === 'semantic_locator' && !nonEmpty(condition.scope.description)) {
    issues.push(issueForCode('SCOPE_LOCATOR_REQUIRED', 'error', 'checklist', path, 'scope.description'));
  }

  switch (condition.type) {
    case 'semantic':
      if (!nonEmpty(condition.instruction)) issues.push(issueForCode('SEMANTIC_INSTRUCTION_REQUIRED', 'error', 'checklist', path, 'instruction'));
      break;
    case 'required_text':
    case 'forbidden_text':
      if (condition.values.filter(nonEmpty).length === 0) issues.push(issueForCode('TEXT_VALUES_REQUIRED', 'error', 'checklist', path, 'values'));
      break;
    case 'number':
      if (!nonEmpty(condition.subject)) issues.push(issueForCode('NUMBER_SUBJECT_REQUIRED', 'error', 'checklist', path, 'subject'));
      if (condition.operator === 'between') {
        if (condition.minimum === undefined || condition.maximum === undefined || condition.minimum > condition.maximum) issues.push(issueForCode('NUMBER_RANGE_INVALID', 'error', 'checklist', path, 'range'));
      } else if (condition.value === undefined) issues.push(issueForCode('NUMBER_VALUE_REQUIRED', 'error', 'checklist', path, 'value'));
      break;
    case 'length_or_count':
      if (condition.operator === 'between') {
        if (condition.minimum === undefined || condition.maximum === undefined || condition.minimum > condition.maximum) issues.push(issueForCode('COUNT_RANGE_INVALID', 'error', 'checklist', path, 'range'));
      } else if (condition.value === undefined) issues.push(issueForCode('COUNT_VALUE_REQUIRED', 'error', 'checklist', path, 'value'));
      break;
    case 'date_or_deadline':
      if (!nonEmpty(condition.subject)) issues.push(issueForCode('DATE_SUBJECT_REQUIRED', 'error', 'checklist', path, 'subject'));
      if (condition.operator === 'between') {
        if (!condition.minimum || !condition.maximum || condition.minimum > condition.maximum) issues.push(issueForCode('DATE_RANGE_INVALID', 'error', 'checklist', path, 'range'));
      } else if (!['exists', 'start_on_or_before_end'].includes(condition.operator) && !condition.value) issues.push(issueForCode('DATE_VALUE_REQUIRED', 'error', 'checklist', path, 'value'));
      break;
    case 'pattern':
      if (!nonEmpty(condition.pattern)) issues.push(issueForCode('PATTERN_REQUIRED', 'error', 'checklist', path, 'pattern'));
      else {
        try { new RegExp(condition.pattern); } catch { issues.push(issueForCode('PATTERN_INVALID', 'error', 'checklist', path, 'pattern')); }
      }
      break;
    case 'one_of':
      if (!nonEmpty(condition.subject) || condition.allowedValues.filter(nonEmpty).length === 0) issues.push(issueForCode('ONE_OF_VALUES_REQUIRED', 'error', 'checklist', path));
      break;
    case 'cross_source_consistency':
      if (!nonEmpty(condition.instruction)) issues.push(issueForCode('CONSISTENCY_INSTRUCTION_REQUIRED', 'error', 'checklist', path, 'instruction'));
      for (const sourceId of condition.sourceIds) if (!sourceIds.has(sourceId)) issues.push(issueForCode('REFERENCE_ID_UNKNOWN', 'error', 'checklist', path, 'sourceIds'));
      break;
  }
  return issues;
};

export const validateProject = (project: ProjectDefinition): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(project.name)) issues.push(issueForCode('PROJECT_NAME_REQUIRED', 'error', 'overview', undefined, 'name'));
  if (project.mode === 'existing_document' && !project.target) issues.push(issueForCode('TARGET_REQUIRED', 'error', 'document'));
  if (project.mode === 'document_generation') {
    if (!project.generation) issues.push(issueForCode('GENERATION_REQUIRED', 'error', 'generation'));
    else {
      if (!nonEmpty(project.generation.title)) issues.push(issueForCode('GENERATION_TITLE_REQUIRED', 'error', 'generation', undefined, 'title'));
      if (!nonEmpty(project.generation.instructions)) issues.push(issueForCode('GENERATION_INSTRUCTIONS_REQUIRED', 'error', 'generation', undefined, 'instructions'));
    }
  }
  if (project.target?.format === 'pdf' && project.defaultRepairPolicy === 'auto_fix') issues.push(issueForCode('PDF_AUTOFIX_WARNING', 'warning', 'document'));

  const referenceIds = new Set<string>();
  for (const reference of project.references) {
    if (referenceIds.has(reference.id)) issues.push(issueForCode('REFERENCE_ID_DUPLICATE', 'error', 'references', reference.id));
    referenceIds.add(reference.id);
    if (reference.priority < 0 || reference.priority > 100) issues.push(issueForCode('REFERENCE_PRIORITY_INVALID', 'error', 'references', reference.id, 'priority'));
  }

  const itemIds = new Set<string>();
  const conditionIds = new Set<string>();
  for (const item of project.checklist.items) {
    if (!/^CHK-[0-9]{4}$/.test(item.id)) issues.push(issueForCode('CHECK_ITEM_ID_INVALID', 'error', 'checklist', item.id, 'id'));
    if (itemIds.has(item.id)) issues.push(issueForCode('CHECK_ITEM_ID_DUPLICATE', 'error', 'checklist', item.id, 'id'));
    itemIds.add(item.id);
    if (!nonEmpty(item.title)) issues.push(issueForCode('CHECK_ITEM_TITLE_REQUIRED', 'error', 'checklist', item.id, 'title'));
    if (item.conditions.length === 0) issues.push(issueForCode('CONDITION_GROUP_EMPTY', 'error', 'checklist', item.id, 'conditions'));
    if (item.required && item.allowNotApplicable) issues.push(issueForCode('REQUIRED_ITEM_NA_WARNING', 'warning', 'checklist', item.id, 'allowNotApplicable'));
    for (const condition of item.conditions) {
      if (conditionIds.has(condition.id)) issues.push(issueForCode('CONDITION_ID_DUPLICATE', 'error', 'checklist', item.id, condition.id));
      conditionIds.add(condition.id);
      issues.push(...validateCondition(condition, item.id, referenceIds));
    }
  }

  const authorityKeys = new Set<string>();
  for (const reference of project.references) {
    const key = `${reference.authorityLevel}:${reference.priority}`;
    if (authorityKeys.has(key)) issues.push(issueForCode('REFERENCE_PRECEDENCE_TIE', 'warning', 'references', reference.id));
    authorityKeys.add(key);
  }

  return issues.sort((left, right) => {
    const severity = left.severity === right.severity ? 0 : left.severity === 'error' ? -1 : 1;
    return severity || left.section.localeCompare(right.section) || (left.entityId ?? '').localeCompare(right.entityId ?? '') || left.code.localeCompare(right.code);
  });
};
