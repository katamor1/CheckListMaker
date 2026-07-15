import { describe, expect, it } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
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
});
