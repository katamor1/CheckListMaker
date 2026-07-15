import { describe, expect, it } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { ConditionDefinition, ScopeDefinition } from '../src/shared/model.js';
import {
  addCheckItem,
  addCondition,
  changeConditionType,
  changeScopeType,
  createCondition,
  duplicateCheckItem,
  moveCheckItem,
  removeCheckItem,
  removeCondition
} from '../src/renderer/checklist-editor-model.js';

const conditionTypes: ConditionDefinition['type'][] = [
  'semantic',
  'required_text',
  'forbidden_text',
  'number',
  'length_or_count',
  'date_or_deadline',
  'pattern',
  'one_of',
  'cross_source_consistency'
];

describe('checklist editor model', () => {
  it('項目追加で未使用の項目IDと条件IDを割り当てる', () => {
    const checklist = createProject('existing_document').checklist;
    const updated = addCheckItem(checklist);

    expect(updated.items.map((item) => item.id)).toEqual(['CHK-0001', 'CHK-0002']);
    expect(updated.items[1]?.conditions[0]?.id).toBe('COND-02');
  });

  it('項目複製で項目と全条件へ新しいIDを割り当てる', () => {
    const checklist = createProject('existing_document').checklist;
    const withSecondCondition = addCondition(checklist, 'CHK-0001', 'required_text');
    const duplicated = duplicateCheckItem(withSecondCondition, 'CHK-0001');

    expect(duplicated.items[1]?.id).toBe('CHK-0002');
    expect(duplicated.items[1]?.title).toContain('コピー');
    expect(duplicated.items[1]?.conditions.map((condition) => condition.id)).toEqual(['COND-03', 'COND-04']);
  });

  it('項目削除で項目IDと配下条件IDを廃止集合へ移す', () => {
    const checklist = addCondition(createProject('existing_document').checklist, 'CHK-0001', 'number');
    const removed = removeCheckItem(checklist, 'CHK-0001');

    expect(removed.items).toEqual([]);
    expect(removed.retiredCheckItemIds).toEqual(['CHK-0001']);
    expect(removed.retiredConditionIds).toEqual(['COND-01', 'COND-02']);
  });

  it('条件削除で条件IDだけを廃止し、項目順を安全に移動する', () => {
    let checklist = addCheckItem(createProject('existing_document').checklist);
    checklist = moveCheckItem(checklist, 'CHK-0002', -1);
    checklist = removeCondition(checklist, 'CHK-0001', 'COND-01');

    expect(checklist.items.map((item) => item.id)).toEqual(['CHK-0002', 'CHK-0001']);
    expect(checklist.retiredConditionIds).toContain('COND-01');
  });

  it('九種類の条件へ型別の初期値を作成する', () => {
    const created = conditionTypes.map((type, index) => createCondition(type, `COND-${String(index + 1).padStart(2, '0')}`));

    expect(created.map((condition) => condition.type)).toEqual(conditionTypes);
    expect(created.find((condition) => condition.type === 'pattern')).toMatchObject({
      preset: 'email',
      description: 'メールアドレス形式'
    });
  });

  it('条件型変更はIDとスコープを保ち型固有値だけを置き換える', () => {
    const original = createCondition('semantic', 'COND-09');
    const scoped: ConditionDefinition = {
      ...original,
      scope: { type: 'section', heading: '目的', matchMode: 'exact', includeSubsections: true, onNotFound: 'invalid' }
    };
    const changed = changeConditionType(scoped, 'number');

    expect(changed.id).toBe('COND-09');
    expect(changed.scope).toEqual(scoped.scope);
    expect(changed.type).toBe('number');
  });

  it('四種類のスコープへ必要な初期値を作成する', () => {
    const types: ScopeDefinition['type'][] = ['entire_document', 'section', 'table', 'semantic_locator'];
    const scopes = types.map((type) => changeScopeType({ type: 'entire_document', onNotFound: 'invalid' }, type));

    expect(scopes.map((scope) => scope.type)).toEqual(types);
    expect(scopes[1]).toMatchObject({ heading: '', matchMode: 'exact', includeSubsections: true });
    expect(scopes[2]).toMatchObject({ description: '', expectedColumns: [] });
    expect(scopes[3]).toMatchObject({ description: '' });
  });
});
