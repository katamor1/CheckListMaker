import { defaultItem, nextCheckItemId, nextConditionId } from '../shared/defaults.js';
import type {
  ChecklistDefinition,
  CheckItemDefinition,
  ConditionDefinition,
  ScopeDefinition
} from '../shared/model.js';

export type ConditionType = ConditionDefinition['type'];
export type ScopeType = ScopeDefinition['type'];

export const patternPresetDetails = {
  email: {
    pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
    description: 'メールアドレス形式'
  },
  url: {
    pattern: '^https?://[^\\s]+$',
    description: 'HTTPまたはHTTPS URL形式'
  },
  phone: {
    pattern: '^\\+?[0-9() -]{7,20}$',
    description: '電話番号形式'
  },
  postal_code: {
    pattern: '^[0-9]{3}-?[0-9]{4}$',
    description: '日本の郵便番号形式'
  },
  iso_date: {
    pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
    description: 'ISO 8601日付形式'
  },
  management_number: {
    pattern: '^[A-Za-z]+-[0-9]+$',
    description: '英字と数字の管理番号形式'
  },
  custom: {
    pattern: '',
    description: 'カスタム正規表現'
  }
} as const;

export const createCondition = (
  type: ConditionType,
  id: string,
  scope: ScopeDefinition = { type: 'entire_document', onNotFound: 'invalid' }
): ConditionDefinition => {
  switch (type) {
    case 'semantic':
      return { id, type, scope, instruction: '' };
    case 'required_text':
      return { id, type, scope, values: [], matchMode: 'all', caseSensitive: false };
    case 'forbidden_text':
      return { id, type, scope, values: [], caseSensitive: false };
    case 'number':
      return { id, type, scope, subject: '', operator: 'equal', value: 0 };
    case 'length_or_count':
      return { id, type, scope, measure: 'characters', operator: 'equal', value: 0 };
    case 'date_or_deadline':
      return { id, type, scope, subject: '', operator: 'exists' };
    case 'pattern': {
      const preset = patternPresetDetails.email;
      return {
        id,
        type,
        scope,
        preset: 'email',
        pattern: preset.pattern,
        description: preset.description
      };
    }
    case 'one_of':
      return { id, type, scope, subject: '', allowedValues: [] };
    case 'cross_source_consistency':
      return { id, type, scope, instruction: '', sourceIds: [] };
  }
};

export const changeConditionType = (
  condition: ConditionDefinition,
  type: ConditionType
): ConditionDefinition => createCondition(type, condition.id, condition.scope);

export const changeScopeType = (
  scope: ScopeDefinition,
  type: ScopeType
): ScopeDefinition => {
  const onNotFound = scope.onNotFound;
  switch (type) {
    case 'entire_document':
      return { type, onNotFound };
    case 'section':
      return {
        type,
        heading: '',
        matchMode: 'exact',
        includeSubsections: true,
        onNotFound
      };
    case 'table':
      return { type, description: '', expectedColumns: [], onNotFound };
    case 'semantic_locator':
      return { type, description: '', onNotFound };
  }
};

const appendUnique = (values: readonly string[], additions: readonly string[]): string[] => {
  const result = [...values];
  const known = new Set(result);
  for (const addition of additions) {
    if (!known.has(addition)) {
      known.add(addition);
      result.push(addition);
    }
  }
  return result;
};

const nextConditionIdentifier = (
  checklist: ChecklistDefinition,
  additionallyUsed: readonly string[] = []
): string => {
  const used = new Set([
    ...checklist.items.flatMap((item) => item.conditions.map((condition) => condition.id)),
    ...checklist.retiredConditionIds,
    ...additionallyUsed
  ]);
  for (let value = 1; value < 100; value += 1) {
    const candidate = `COND-${String(value).padStart(2, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error('COND IDをこれ以上発行できません。');
};

export const updateCheckItem = (
  checklist: ChecklistDefinition,
  itemId: string,
  update: (item: CheckItemDefinition) => CheckItemDefinition
): ChecklistDefinition => {
  let found = false;
  const items = checklist.items.map((item) => {
    if (item.id !== itemId) return item;
    found = true;
    return update(item);
  });
  return found ? { ...checklist, items } : checklist;
};

export const updateCondition = (
  checklist: ChecklistDefinition,
  itemId: string,
  conditionId: string,
  update: (condition: ConditionDefinition) => ConditionDefinition
): ChecklistDefinition => updateCheckItem(checklist, itemId, (item) => ({
  ...item,
  conditions: item.conditions.map((condition) => condition.id === conditionId ? update(condition) : condition)
}));

export const addCheckItem = (checklist: ChecklistDefinition): ChecklistDefinition => {
  const id = nextCheckItemId(checklist);
  const conditionId = nextConditionId(checklist);
  const item = {
    ...defaultItem(id),
    title: '新しいチェック項目',
    conditions: [createCondition('semantic', conditionId)]
  };
  return { ...checklist, items: [...checklist.items, item] };
};

export const duplicateCheckItem = (
  checklist: ChecklistDefinition,
  itemId: string
): ChecklistDefinition => {
  const source = checklist.items.find((item) => item.id === itemId);
  if (!source) return checklist;

  const id = nextCheckItemId(checklist);
  const assignedIds: string[] = [];
  const conditions = source.conditions.map((condition) => {
    const conditionId = nextConditionIdentifier(checklist, assignedIds);
    assignedIds.push(conditionId);
    return { ...structuredClone(condition), id: conditionId } as ConditionDefinition;
  });
  const duplicate: CheckItemDefinition = {
    ...structuredClone(source),
    id,
    title: `${source.title}（コピー）`,
    conditions
  };
  const sourceIndex = checklist.items.findIndex((item) => item.id === itemId);
  const items = [...checklist.items];
  items.splice(sourceIndex + 1, 0, duplicate);
  return { ...checklist, items };
};

export const removeCheckItem = (
  checklist: ChecklistDefinition,
  itemId: string
): ChecklistDefinition => {
  const target = checklist.items.find((item) => item.id === itemId);
  if (!target) return checklist;
  return {
    ...checklist,
    items: checklist.items.filter((item) => item.id !== itemId),
    retiredCheckItemIds: appendUnique(checklist.retiredCheckItemIds, [target.id]),
    retiredConditionIds: appendUnique(
      checklist.retiredConditionIds,
      target.conditions.map((condition) => condition.id)
    )
  };
};

const moveById = <T extends { id: string }>(
  values: readonly T[],
  id: string,
  direction: -1 | 1
): T[] => {
  const index = values.findIndex((value) => value.id === id);
  if (index < 0) return [...values];
  const target = index + direction;
  if (target < 0 || target >= values.length) return [...values];
  const moved = [...values];
  const [value] = moved.splice(index, 1);
  if (!value) return [...values];
  moved.splice(target, 0, value);
  return moved;
};

export const moveCheckItem = (
  checklist: ChecklistDefinition,
  itemId: string,
  direction: -1 | 1
): ChecklistDefinition => ({
  ...checklist,
  items: moveById(checklist.items, itemId, direction)
});

export const addCondition = (
  checklist: ChecklistDefinition,
  itemId: string,
  type: ConditionType
): ChecklistDefinition => {
  if (!checklist.items.some((item) => item.id === itemId)) return checklist;
  const id = nextConditionId(checklist);
  return updateCheckItem(checklist, itemId, (item) => ({
    ...item,
    conditions: [...item.conditions, createCondition(type, id)]
  }));
};

export const removeCondition = (
  checklist: ChecklistDefinition,
  itemId: string,
  conditionId: string
): ChecklistDefinition => {
  const item = checklist.items.find((candidate) => candidate.id === itemId);
  if (!item?.conditions.some((condition) => condition.id === conditionId)) return checklist;
  return {
    ...updateCheckItem(checklist, itemId, (current) => ({
      ...current,
      conditions: current.conditions.filter((condition) => condition.id !== conditionId)
    })),
    retiredConditionIds: appendUnique(checklist.retiredConditionIds, [conditionId])
  };
};

export const moveCondition = (
  checklist: ChecklistDefinition,
  itemId: string,
  conditionId: string,
  direction: -1 | 1
): ChecklistDefinition => updateCheckItem(checklist, itemId, (item) => ({
  ...item,
  conditions: moveById(item.conditions, conditionId, direction)
}));
