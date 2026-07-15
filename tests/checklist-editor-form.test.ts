import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { ConditionDefinition, ScopeDefinition } from '../src/shared/model.js';
import { ChecklistEditor } from '../src/renderer/ChecklistEditor.js';
import { ConditionEditor } from '../src/renderer/ConditionEditor.js';
import { changeScopeType, createCondition } from '../src/renderer/checklist-editor-model.js';

const types: ConditionDefinition['type'][] = [
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

describe('ChecklistEditor', () => {
  it('九種類の条件フォームをチェック項目内に表示する', () => {
    const project = createProject('existing_document');
    const conditions = types.map((type, index) => createCondition(type, `COND-${String(index + 1).padStart(2, '0')}`));
    const checklist = {
      ...project.checklist,
      items: [{ ...project.checklist.items[0]!, conditions }],
      requiredReferenceRoles: [{
        roleId: 'ROLE-001',
        name: '品質基準',
        required: true,
        recommendedAuthorityLevel: 'approved' as const
      }]
    };

    const html = renderToStaticMarkup(createElement(ChecklistEditor, {
      checklist,
      defaultRepairPolicy: 'suggest_only',
      references: [{ id: 'REF-001', title: '品質保証規程' }],
      disabled: false,
      onChecklistChange: vi.fn(),
      onDefaultRepairPolicyChange: vi.fn()
    }));

    expect(html).toContain('name="checklist-name"');
    expect(html).toContain('name="item-title-CHK-0001"');
    expect(html).toContain('ロールを追加');
    expect(html).toContain('name="reference-role-name-ROLE-001"');
    expect(html).toContain('name="reference-role-required-ROLE-001"');
    expect(html).toContain('name="condition-type-COND-01"');
    expect(html).toContain('name="condition-semantic-instruction-COND-01"');
    expect(html).toContain('name="condition-required-values-COND-02"');
    expect(html).toContain('name="condition-forbidden-values-COND-03"');
    expect(html).toContain('name="condition-number-subject-COND-04"');
    expect(html).toContain('name="condition-count-measure-COND-05"');
    expect(html).toContain('name="condition-date-subject-COND-06"');
    expect(html).toContain('name="condition-pattern-preset-COND-07"');
    expect(html).toContain('name="condition-one-of-values-COND-08"');
    expect(html).toContain('name="condition-source-REF-001-COND-09"');
  });
});

describe('ConditionEditor scope forms', () => {
  it.each<ScopeDefinition['type']>(['entire_document', 'section', 'table', 'semantic_locator'])(
    '%s スコープの具体的な入力欄を表示する',
    (scopeType) => {
      const base = createCondition('semantic', 'COND-01');
      const condition = { ...base, scope: changeScopeType(base.scope, scopeType) };
      const html = renderToStaticMarkup(createElement(ConditionEditor, {
        condition,
        references: [],
        disabled: false,
        onChange: vi.fn(),
        onRemove: vi.fn(),
        onMoveUp: vi.fn(),
        onMoveDown: vi.fn(),
        canMoveUp: false,
        canMoveDown: false
      }));

      expect(html).toContain('name="condition-scope-COND-01"');
      expect(html).toContain('name="condition-on-not-found-COND-01"');
      if (scopeType === 'section') {
        expect(html).toContain('name="condition-scope-heading-COND-01"');
        expect(html).toContain('name="condition-scope-heading-mode-COND-01"');
      }
      if (scopeType === 'table') {
        expect(html).toContain('name="condition-scope-table-description-COND-01"');
        expect(html).toContain('name="condition-scope-table-columns-COND-01"');
      }
      if (scopeType === 'semantic_locator') {
        expect(html).toContain('name="condition-scope-locator-COND-01"');
      }
    }
  );
});
