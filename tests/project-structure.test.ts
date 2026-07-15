import { describe, expect, it } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { ConditionDefinition, ScopeDefinition } from '../src/shared/model.js';
import {
  assertPersistedProjectDefinition,
  assertProjectDefinition,
  assertRecord
} from '../src/shared/project-structure.js';

const selected = {
  token: 'LIVE-TOKEN', originalFileName: 'target.md', storedPath: 'documents/target.md',
  mediaType: 'text/markdown', sizeBytes: 4, sha256: 'a'.repeat(64), format: 'md' as const, editable: true
};

const reference = {
  id: 'REF-001',
  document: selected,
  title: '基準資料',
  purpose: '照合',
  authorityLevel: 'approved' as const,
  priority: 50,
  roleIds: [],
  readOnly: true as const
};

const expectBothInvalid = (value: unknown): void => {
  expect(() => assertProjectDefinition(value)).toThrow('プロジェクトデータの構造が不正です。');
  expect(() => assertPersistedProjectDefinition(value)).toThrow('プロジェクトデータの構造が不正です。');
};

const entireScope: ScopeDefinition = {
  type: 'entire_document',
  onNotFound: 'invalid'
};

const projectWithCondition = (condition: unknown): unknown => {
  const project = createProject('existing_document');
  return {
    ...project,
    checklist: {
      ...project.checklist,
      items: [{ ...project.checklist.items[0]!, conditions: [condition] }]
    }
  };
};

const scopeCases: Array<{ name: string; valid: ScopeDefinition; malformed: unknown }> = [
  {
    name: 'entire_document',
    valid: entireScope,
    malformed: { type: 'entire_document', onNotFound: 'skip' }
  },
  {
    name: 'section',
    valid: {
      type: 'section',
      heading: '概要',
      matchMode: 'semantic',
      includeSubsections: true,
      onNotFound: 'needs_information'
    },
    malformed: {
      type: 'section',
      heading: 42,
      matchMode: 'exact',
      includeSubsections: false,
      onNotFound: 'invalid'
    }
  },
  {
    name: 'table',
    valid: {
      type: 'table',
      description: '承認一覧',
      expectedColumns: ['担当者', '日付'],
      onNotFound: 'invalid'
    },
    malformed: {
      type: 'table',
      description: '承認一覧',
      expectedColumns: '担当者',
      onNotFound: 'invalid'
    }
  },
  {
    name: 'semantic_locator',
    valid: {
      type: 'semantic_locator',
      description: '結論を述べている箇所',
      onNotFound: 'needs_information'
    },
    malformed: {
      type: 'semantic_locator',
      description: false,
      onNotFound: 'invalid'
    }
  }
];

const conditionCases: Array<{ name: string; valid: ConditionDefinition; malformed: unknown }> = [
  {
    name: 'semantic',
    valid: { id: 'COND-01', type: 'semantic', instruction: '目的が明確であること', scope: entireScope },
    malformed: { id: 'COND-01', type: 'semantic', instruction: 42, scope: entireScope }
  },
  {
    name: 'required_text',
    valid: {
      id: 'COND-01',
      type: 'required_text',
      values: ['承認済み'],
      matchMode: 'all',
      caseSensitive: false,
      scope: entireScope
    },
    malformed: {
      id: 'COND-01',
      type: 'required_text',
      values: '承認済み',
      matchMode: 'all',
      caseSensitive: false,
      scope: entireScope
    }
  },
  {
    name: 'forbidden_text',
    valid: {
      id: 'COND-01',
      type: 'forbidden_text',
      values: ['未確定'],
      caseSensitive: true,
      scope: entireScope
    },
    malformed: {
      id: 'COND-01',
      type: 'forbidden_text',
      values: ['未確定'],
      caseSensitive: 'yes',
      scope: entireScope
    }
  },
  {
    name: 'number',
    valid: {
      id: 'COND-01',
      type: 'number',
      subject: '承認者数',
      operator: 'greater_than_or_equal',
      value: 2,
      unit: '人',
      scope: entireScope
    },
    malformed: {
      id: 'COND-01',
      type: 'number',
      subject: false,
      operator: 'equal',
      value: 2,
      scope: entireScope
    }
  },
  {
    name: 'length_or_count',
    valid: {
      id: 'COND-01',
      type: 'length_or_count',
      measure: 'headings',
      operator: 'less_than_or_equal',
      value: 10,
      scope: entireScope
    },
    malformed: {
      id: 'COND-01',
      type: 'length_or_count',
      measure: 'bytes',
      operator: 'equal',
      value: 10,
      scope: entireScope
    }
  },
  {
    name: 'date_or_deadline',
    valid: {
      id: 'COND-01',
      type: 'date_or_deadline',
      subject: '提出期限',
      operator: 'on_or_before',
      value: '2025-12-31',
      scope: entireScope
    },
    malformed: {
      id: 'COND-01',
      type: 'date_or_deadline',
      subject: 42,
      operator: 'exists',
      scope: entireScope
    }
  },
  {
    name: 'pattern',
    valid: {
      id: 'COND-01',
      type: 'pattern',
      preset: 'management_number',
      pattern: '^DOC-[0-9]+$',
      description: '文書管理番号',
      scope: entireScope
    },
    malformed: {
      id: 'COND-01',
      type: 'pattern',
      preset: 'management_number',
      pattern: 42,
      description: '文書管理番号',
      scope: entireScope
    }
  },
  {
    name: 'one_of',
    valid: {
      id: 'COND-01',
      type: 'one_of',
      subject: '状態',
      allowedValues: ['承認', '却下'],
      scope: entireScope
    },
    malformed: {
      id: 'COND-01',
      type: 'one_of',
      subject: '状態',
      allowedValues: '承認',
      scope: entireScope
    }
  },
  {
    name: 'cross_source_consistency',
    valid: {
      id: 'COND-01',
      type: 'cross_source_consistency',
      instruction: '申請者名が一致すること',
      sourceIds: ['REF-001'],
      scope: entireScope
    },
    malformed: {
      id: 'COND-01',
      type: 'cross_source_consistency',
      instruction: '申請者名が一致すること',
      sourceIds: 'REF-001',
      scope: entireScope
    }
  }
];

describe('assertProjectDefinition', () => {
  it('accepts a structurally valid project even when business validation has issues', () => {
    expect(() => assertProjectDefinition(createProject('existing_document'))).not.toThrow();
  });

  it('accepts an empty persisted token but requires a non-empty live token', () => {
    const persisted = { ...createProject('existing_document'), target: { ...selected, token: '' } };
    expect(() => assertPersistedProjectDefinition(persisted)).not.toThrow();
    expect(() => assertProjectDefinition(persisted)).toThrow('プロジェクトデータの構造が不正です。');
    expect(() => assertProjectDefinition({ ...persisted, target: selected })).not.toThrow();
  });

  it('applies the persisted/live token rule to references too', () => {
    const live = { ...createProject('document_generation'), references: [reference] };
    const persisted = {
      ...live,
      references: [{ ...reference, document: { ...reference.document, token: '' } }]
    };

    expect(() => assertProjectDefinition(live)).not.toThrow();
    expect(() => assertPersistedProjectDefinition(persisted)).not.toThrow();
    expect(() => assertPersistedProjectDefinition(live)).toThrow('プロジェクトデータの構造が不正です。');
  });

  it('narrows only records before metadata is spread', () => {
    expect(() => assertRecord(null)).toThrow('プロジェクトデータの構造が不正です。');
    expect(() => assertRecord({ formatVersion: '1.0' })).not.toThrow();
  });

  it.each([
    null,
    { ...createProject('existing_document'), references: null },
    { ...createProject('document_generation'), generation: { instructions: 42 } },
    {
      ...createProject('existing_document'),
      checklist: { ...createProject('existing_document').checklist, items: [{ conditions: 'bad' }] }
    }
  ])('rejects unsafe project topology', (value) => {
    expect(() => assertProjectDefinition(value)).toThrow('プロジェクトデータの構造が不正です。');
  });

  it.each([
    { ...createProject('existing_document'), formatVersion: '2.0' },
    { ...createProject('existing_document'), projectId: undefined },
    { ...createProject('existing_document'), name: 42 },
    { ...createProject('existing_document'), createdAt: null },
    { ...createProject('existing_document'), updatedAt: 42 },
    { ...createProject('existing_document'), mode: 'other' },
    { ...createProject('existing_document'), defaultRepairPolicy: 'overwrite' },
    { ...createProject('existing_document'), references: {} },
    {
      ...createProject('existing_document'),
      checklist: { ...createProject('existing_document').checklist, retiredCheckItemIds: null }
    },
    {
      ...createProject('existing_document'),
      checklist: { ...createProject('existing_document').checklist, retiredConditionIds: null }
    },
    {
      ...createProject('existing_document'),
      checklist: { ...createProject('existing_document').checklist, requiredReferenceRoles: null }
    },
    { ...createProject('existing_document'), target: { ...selected, sizeBytes: '4' } },
    { ...createProject('existing_document'), target: { ...selected, format: 'html' } },
    { ...createProject('document_generation'), generation: { ...createProject('document_generation').generation, requestedFormat: 'pdf' } },
    { ...createProject('document_generation'), generation: { ...createProject('document_generation').generation, useReferencesAsFacts: 'yes' } },
    { ...createProject('document_generation'), references: [{ ...reference, authorityLevel: 'owner' }] },
    { ...createProject('document_generation'), references: [{ ...reference, readOnly: false }] },
    {
      ...createProject('existing_document'),
      checklist: {
        ...createProject('existing_document').checklist,
        items: [{ ...createProject('existing_document').checklist.items[0], conditionLogic: 'none' }]
      }
    },
    {
      ...createProject('existing_document'),
      checklist: {
        ...createProject('existing_document').checklist,
        items: [{ ...createProject('existing_document').checklist.items[0], repairPolicy: 'overwrite' }]
      }
    },
    {
      ...createProject('existing_document'),
      checklist: {
        ...createProject('existing_document').checklist,
        items: [{
          ...createProject('existing_document').checklist.items[0],
          conditions: [{ ...createProject('existing_document').checklist.items[0]!.conditions[0], type: 'unknown' }]
        }]
      }
    },
    {
      ...createProject('existing_document'),
      checklist: {
        ...createProject('existing_document').checklist,
        items: [{
          ...createProject('existing_document').checklist.items[0],
          conditions: [{
            ...createProject('existing_document').checklist.items[0]!.conditions[0],
            scope: { type: 'page', onNotFound: 'invalid' }
          }]
        }]
      }
    },
    {
      ...createProject('existing_document'),
      checklist: {
        ...createProject('existing_document').checklist,
        items: [{
          ...createProject('existing_document').checklist.items[0],
          conditions: [{
            ...createProject('existing_document').checklist.items[0]!.conditions[0],
            scope: { type: 'entire_document', onNotFound: 'skip' }
          }]
        }]
      }
    },
    { ...createProject('existing_document'), target: 42 },
    { ...createProject('document_generation'), generation: 'bad' }
  ])('rejects malformed required fields and discriminated values', (value) => {
    expectBothInvalid(value);
  });

  it('never exposes values or paths in structure errors', () => {
    const privateValue = { ...createProject('existing_document'), projectId: 'C:\\private\\secret.clmproj', references: null };

    try {
      assertProjectDefinition(privateValue);
      throw new Error('expected validation to fail');
    } catch (error) {
      expect(error).toEqual(new Error('プロジェクトデータの構造が不正です。'));
      expect(String(error)).not.toContain('C:\\private');
    }
  });

  it.each(scopeCases)('accepts the existing $name scope shape', ({ valid }) => {
    const project = projectWithCondition({
      id: 'COND-01',
      type: 'semantic',
      instruction: '対象範囲を確認する',
      scope: valid
    });

    expect(() => assertProjectDefinition(project)).not.toThrow();
    expect(() => assertPersistedProjectDefinition(project)).not.toThrow();
  });

  it.each(scopeCases)('rejects a malformed $name scope-specific field', ({ malformed }) => {
    const project = projectWithCondition({
      id: 'COND-01',
      type: 'semantic',
      instruction: '対象範囲を確認する',
      scope: malformed
    });

    expectBothInvalid(project);
  });

  it.each(conditionCases)('accepts the existing $name condition shape', ({ valid }) => {
    const project = projectWithCondition(valid);

    expect(() => assertProjectDefinition(project)).not.toThrow();
    expect(() => assertPersistedProjectDefinition(project)).not.toThrow();
  });

  it.each(conditionCases)('rejects a malformed $name condition-specific field', ({ malformed }) => {
    expectBothInvalid(projectWithCondition(malformed));
  });
});
