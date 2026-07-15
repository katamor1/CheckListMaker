import type { ChecklistDefinition, CheckItemDefinition, ConditionDefinition, ProjectDefinition, ProjectMode, ScopeDefinition } from './model.js';
import { FORMAT_VERSION } from './model.js';

export const entireDocumentScope = (): ScopeDefinition => ({
  type: 'entire_document',
  onNotFound: 'invalid'
});

export const semanticCondition = (id = 'COND-01'): ConditionDefinition => ({
  id,
  type: 'semantic',
  instruction: '文書の目的が具体的かつ明確に説明されていること',
  scope: entireDocumentScope()
});

export const defaultItem = (id = 'CHK-0001'): CheckItemDefinition => ({
  id,
  title: '目的が明確であること',
  required: true,
  allowNotApplicable: false,
  conditionLogic: 'all',
  conditions: [semanticCondition()]
});

export const defaultChecklist = (): ChecklistDefinition => ({
  name: '新しいチェックリスト',
  items: [defaultItem()],
  retiredCheckItemIds: [],
  retiredConditionIds: [],
  requiredReferenceRoles: []
});

export const createProject = (mode: ProjectMode): ProjectDefinition => {
  const now = new Date().toISOString();
  const common = {
    formatVersion: FORMAT_VERSION,
    projectId: globalThis.crypto.randomUUID(),
    name: '新しいプロジェクト',
    mode,
    references: [],
    checklist: defaultChecklist(),
    origin: { type: 'created_in_project' as const },
    defaultRepairPolicy: 'suggest_only' as const,
    createdAt: now,
    updatedAt: now
  };

  return mode === 'document_generation'
    ? {
        ...common,
        generation: {
          title: '生成する文書',
          purpose: '',
          audience: '',
          language: 'ja',
          requestedFormat: 'docx',
          instructions: '',
          useReferencesAsFacts: true,
          prohibitUnsupportedClaims: true
        }
      }
    : common;
};

const nextNumericId = (prefix: string, width: number, used: Iterable<string>): string => {
  const set = new Set(used);
  for (let value = 1; value < 10 ** width; value += 1) {
    const candidate = `${prefix}-${String(value).padStart(width, '0')}`;
    if (!set.has(candidate)) return candidate;
  }
  throw new Error(`${prefix} IDをこれ以上発行できません。`);
};

export const nextCheckItemId = (checklist: ChecklistDefinition): string =>
  nextNumericId('CHK', 4, [...checklist.items.map((item) => item.id), ...checklist.retiredCheckItemIds]);

export const nextConditionId = (checklist: ChecklistDefinition): string =>
  nextNumericId(
    'COND',
    2,
    [...checklist.items.flatMap((item) => item.conditions.map((condition) => condition.id)), ...checklist.retiredConditionIds]
  );

export const nextReferenceId = (project: ProjectDefinition): string =>
  nextNumericId('REF', 3, project.references.map((reference) => reference.id));
