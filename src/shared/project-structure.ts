import type { ProjectDefinition } from './model.js';
import { FORMAT_VERSION } from './model.js';

const STRUCTURE_ERROR_MESSAGE = 'プロジェクトデータの構造が不正です。';

type TokenKind = 'persisted' | 'live';

function invalidStructure(): never {
  throw new Error(STRUCTURE_ERROR_MESSAGE);
}

function assertCondition(condition: boolean): asserts condition {
  if (!condition) invalidStructure();
}

export function assertRecord(value: unknown): asserts value is Record<string, unknown> {
  assertCondition(typeof value === 'object' && value !== null && !Array.isArray(value));
}

function assertString(value: unknown): asserts value is string {
  assertCondition(typeof value === 'string');
}

function assertBoolean(value: unknown): asserts value is boolean {
  assertCondition(typeof value === 'boolean');
}

function assertNumber(value: unknown): asserts value is number {
  assertCondition(typeof value === 'number' && Number.isFinite(value));
}

function assertOneOf(value: unknown, allowed: readonly unknown[]): void {
  assertCondition(allowed.includes(value));
}

function assertOptionalString(value: unknown): void {
  if (value !== undefined) assertString(value);
}

function assertOptionalBoolean(value: unknown): void {
  if (value !== undefined) assertBoolean(value);
}

function assertOptionalNumber(value: unknown): void {
  if (value !== undefined) assertNumber(value);
}

function assertStringArray(value: unknown): void {
  assertCondition(Array.isArray(value));
  for (const entry of value) assertString(entry);
}

function assertScope(value: unknown): void {
  assertRecord(value);
  assertOneOf(value.onNotFound, ['invalid', 'needs_information']);
  switch (value.type) {
    case 'entire_document':
      break;
    case 'section':
      assertString(value.heading);
      assertOneOf(value.matchMode, ['exact', 'semantic']);
      assertBoolean(value.includeSubsections);
      break;
    case 'table':
      assertString(value.description);
      assertStringArray(value.expectedColumns);
      break;
    case 'semantic_locator':
      assertString(value.description);
      break;
    default:
      invalidStructure();
  }
}

function assertConditionDefinition(value: unknown): void {
  assertRecord(value);
  assertString(value.id);
  assertScope(value.scope);
  switch (value.type) {
    case 'semantic':
      assertString(value.instruction);
      break;
    case 'required_text':
      assertStringArray(value.values);
      assertOneOf(value.matchMode, ['all', 'any']);
      assertBoolean(value.caseSensitive);
      break;
    case 'forbidden_text':
      assertStringArray(value.values);
      assertBoolean(value.caseSensitive);
      break;
    case 'number':
      assertString(value.subject);
      assertOneOf(value.operator, [
        'equal',
        'not_equal',
        'less_than',
        'less_than_or_equal',
        'greater_than',
        'greater_than_or_equal',
        'between'
      ]);
      assertOptionalNumber(value.value);
      assertOptionalNumber(value.minimum);
      assertOptionalNumber(value.maximum);
      assertOptionalString(value.unit);
      break;
    case 'length_or_count':
      assertOneOf(value.measure, [
        'characters',
        'words',
        'paragraphs',
        'headings',
        'list_items',
        'occurrences'
      ]);
      assertOneOf(value.operator, ['equal', 'less_than_or_equal', 'greater_than_or_equal', 'between']);
      assertOptionalNumber(value.value);
      assertOptionalNumber(value.minimum);
      assertOptionalNumber(value.maximum);
      assertOptionalString(value.occurrenceText);
      break;
    case 'date_or_deadline':
      assertString(value.subject);
      assertOneOf(value.operator, [
        'exists',
        'on',
        'before',
        'on_or_before',
        'after',
        'on_or_after',
        'between',
        'start_on_or_before_end'
      ]);
      assertOptionalString(value.value);
      assertOptionalString(value.minimum);
      assertOptionalString(value.maximum);
      break;
    case 'pattern':
      assertOneOf(value.preset, [
        'email',
        'url',
        'phone',
        'postal_code',
        'iso_date',
        'management_number',
        'custom'
      ]);
      assertString(value.pattern);
      assertString(value.description);
      break;
    case 'one_of':
      assertString(value.subject);
      assertStringArray(value.allowedValues);
      break;
    case 'cross_source_consistency':
      assertString(value.instruction);
      assertStringArray(value.sourceIds);
      break;
    default:
      invalidStructure();
  }
}

function assertCheckItem(value: unknown): void {
  assertRecord(value);
  assertString(value.id);
  assertString(value.title);
  assertOptionalString(value.description);
  assertBoolean(value.required);
  assertBoolean(value.allowNotApplicable);
  assertOneOf(value.conditionLogic, ['all', 'any']);
  if (value.repairPolicy !== undefined) {
    assertOneOf(value.repairPolicy, ['auto_fix', 'suggest_only', 'do_not_modify']);
  }
  assertCondition(Array.isArray(value.conditions));
  for (const condition of value.conditions) assertConditionDefinition(condition);
  assertOptionalString(value.notes);
}

function assertReferenceRole(value: unknown): void {
  assertRecord(value);
  assertString(value.roleId);
  assertString(value.name);
  assertOptionalString(value.description);
  assertBoolean(value.required);
  assertOneOf(value.recommendedAuthorityLevel, ['binding', 'approved', 'working', 'reference']);
}

function assertChecklist(value: unknown): void {
  assertRecord(value);
  assertString(value.name);
  assertOptionalString(value.description);
  assertCondition(Array.isArray(value.items));
  for (const item of value.items) assertCheckItem(item);
  assertStringArray(value.retiredCheckItemIds);
  assertStringArray(value.retiredConditionIds);
  assertCondition(Array.isArray(value.requiredReferenceRoles));
  for (const role of value.requiredReferenceRoles) assertReferenceRole(role);
}

function assertSelectedDocument(value: unknown, tokenKind: TokenKind): void {
  assertRecord(value);
  assertString(value.token);
  assertCondition(tokenKind === 'persisted' ? value.token === '' : value.token.length > 0);
  assertString(value.originalFileName);
  assertCondition(value.originalFileName.length > 0);
  assertString(value.storedPath);
  assertCondition(value.storedPath.length > 0);
  assertString(value.mediaType);
  assertCondition(value.mediaType.length > 0);
  assertNumber(value.sizeBytes);
  assertCondition(Number.isSafeInteger(value.sizeBytes) && value.sizeBytes >= 0);
  assertString(value.sha256);
  assertCondition(/^[0-9a-f]{64}$/i.test(value.sha256));
  assertOneOf(value.format, ['md', 'txt', 'docx', 'pdf']);
  assertBoolean(value.editable);
}

function assertReference(value: unknown, tokenKind: TokenKind): void {
  assertRecord(value);
  assertString(value.id);
  assertSelectedDocument(value.document, tokenKind);
  assertString(value.title);
  assertString(value.purpose);
  assertOneOf(value.authorityLevel, ['binding', 'approved', 'working', 'reference']);
  assertNumber(value.priority);
  assertOptionalString(value.effectiveDate);
  assertStringArray(value.roleIds);
  assertCondition(value.readOnly === true);
}

function assertGeneration(value: unknown): void {
  assertRecord(value);
  assertString(value.title);
  assertString(value.purpose);
  assertString(value.audience);
  assertString(value.language);
  assertOneOf(value.requestedFormat, ['md', 'txt', 'docx']);
  assertString(value.instructions);
  assertBoolean(value.useReferencesAsFacts);
  assertBoolean(value.prohibitUnsupportedClaims);
}

function assertOrigin(value: unknown): void {
  assertRecord(value);
  assertOneOf(value.type, ['created_in_project', 'template']);
  assertOptionalString(value.templateId);
  assertOptionalString(value.templateName);
  assertOptionalNumber(value.revision);
  assertOptionalString(value.versionLabel);
  assertOptionalString(value.importedAt);
  assertOptionalString(value.sourceSha256);
  assertOptionalBoolean(value.modifiedAfterImport);
}

function assertProject(value: unknown, tokenKind: TokenKind): asserts value is ProjectDefinition {
  assertRecord(value);
  assertCondition(value.formatVersion === FORMAT_VERSION);
  assertString(value.projectId);
  assertString(value.name);
  assertOneOf(value.mode, ['existing_document', 'document_generation']);
  if (value.target !== undefined) assertSelectedDocument(value.target, tokenKind);
  if (value.generation !== undefined) assertGeneration(value.generation);
  assertCondition(Array.isArray(value.references));
  for (const reference of value.references) assertReference(reference, tokenKind);
  assertChecklist(value.checklist);
  assertOrigin(value.origin);
  assertOneOf(value.defaultRepairPolicy, ['auto_fix', 'suggest_only', 'do_not_modify']);
  assertString(value.createdAt);
  assertString(value.updatedAt);
}

export function assertPersistedProjectDefinition(value: unknown): asserts value is ProjectDefinition {
  assertProject(value, 'persisted');
}

export function assertProjectDefinition(value: unknown): asserts value is ProjectDefinition {
  assertProject(value, 'live');
}
