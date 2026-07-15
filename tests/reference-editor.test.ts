import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { ReferenceDocumentDefinition, SelectedDocument } from '../src/shared/model.js';
import { ReferenceEditor } from '../src/renderer/ReferenceEditor.js';
import {
  appendSelectedReferences,
  removeReference,
  updateReference
} from '../src/renderer/reference-editor-model.js';

const document = (name: string, format: SelectedDocument['format']): SelectedDocument => ({
  token: `token-${name}`,
  originalFileName: name,
  storedPath: `references/PENDING-${name}`,
  mediaType: format === 'pdf' ? 'application/pdf' : 'text/plain',
  sizeBytes: 10,
  sha256: 'a'.repeat(64),
  format,
  editable: format !== 'pdf'
});

describe('reference editor model', () => {
  it('選択文書へ連番IDと決定的な保存パスを割り当てる', () => {
    const project = createProject('existing_document');

    const updated = appendSelectedReferences(project, [
      document('quality-policy.pdf', 'pdf'),
      document('terms.txt', 'txt')
    ]);

    expect(updated.references.map((reference) => reference.id)).toEqual(['REF-001', 'REF-002']);
    expect(updated.references.map((reference) => reference.document.storedPath)).toEqual([
      'references/REF-001.pdf',
      'references/REF-002.txt'
    ]);
    expect(updated.references[0]).toMatchObject({
      title: 'quality-policy',
      purpose: '',
      authorityLevel: 'reference',
      priority: 50,
      roleIds: [],
      readOnly: true
    });
  });

  it('既存参考資料を変更せず対象IDだけを更新・削除する', () => {
    const project = appendSelectedReferences(
      createProject('existing_document'),
      [document('one.pdf', 'pdf'), document('two.txt', 'txt')]
    );

    const changed = updateReference(project.references, 'REF-002', (reference) => ({
      ...reference,
      title: '用語集',
      priority: 80
    }));
    const removed = removeReference(changed, 'REF-001');

    expect(changed[0]).toBe(project.references[0]);
    expect(changed[1]).toMatchObject({ title: '用語集', priority: 80 });
    expect(removed.map((reference) => reference.id)).toEqual(['REF-002']);
  });
});

describe('ReferenceEditor', () => {
  it('参考資料メタデータとロール割当をGUI項目として表示する', () => {
    const reference: ReferenceDocumentDefinition = {
      id: 'REF-001',
      document: document('quality-policy.pdf', 'pdf'),
      title: '品質保証規程',
      purpose: '品質基準',
      authorityLevel: 'binding',
      priority: 100,
      roleIds: ['ROLE-001'],
      readOnly: true
    };

    const html = renderToStaticMarkup(createElement(ReferenceEditor, {
      references: [reference],
      roles: [{
        roleId: 'ROLE-001',
        name: '品質基準',
        required: true,
        recommendedAuthorityLevel: 'approved'
      }],
      disabled: false,
      onAdd: vi.fn(),
      onChange: vi.fn()
    }));

    expect(html).toContain('参考資料を追加');
    expect(html).toContain('name="reference-title-REF-001"');
    expect(html).toContain('name="reference-purpose-REF-001"');
    expect(html).toContain('name="reference-authority-REF-001"');
    expect(html).toContain('name="reference-priority-REF-001"');
    expect(html).toContain('name="reference-effective-date-REF-001"');
    expect(html).toContain('name="reference-role-REF-001-ROLE-001"');
    expect(html).toContain('PDF・評価のみ');
  });
});
