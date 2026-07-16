import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { ReferenceDocumentDefinition, SelectedDocument } from '../src/shared/model.js';
import { ChecklistEditor } from '../src/renderer/ChecklistEditor.js';
import { GenerationSettingsForm } from '../src/renderer/GenerationSettingsForm.js';
import { ReferenceEditor } from '../src/renderer/ReferenceEditor.js';

const selectedDocument: SelectedDocument = {
  token: 'document-token',
  originalFileName: 'quality-policy.pdf',
  storedPath: 'references/REF-001.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 10,
  sha256: 'a'.repeat(64),
  format: 'pdf',
  editable: false
};

const reference: ReferenceDocumentDefinition = {
  id: 'REF-001',
  document: selectedDocument,
  title: '品質保証規程',
  purpose: '品質基準',
  authorityLevel: 'binding',
  priority: 100,
  roleIds: [],
  readOnly: true
};

describe('Japanese editor copy', () => {
  it('uses the approved generation labels while preserving enum values', () => {
    const project = createProject('document_generation');
    const html = renderToStaticMarkup(createElement(GenerationSettingsForm, {
      generation: project.generation!,
      disabled: false,
      onChange: vi.fn()
    }));

    expect(html).toContain('文書の言語');
    expect(html).toContain('生成するファイル形式');
    expect(html).toContain('value="md"');
    expect(html).toContain('value="txt"');
    expect(html).toContain('value="docx"');
  });

  it('uses the approved reference terminology and explicit empty state', () => {
    const filled = renderToStaticMarkup(createElement(ReferenceEditor, {
      references: [reference],
      roles: [],
      disabled: false,
      onAdd: vi.fn(),
      onChange: vi.fn()
    }));
    const empty = renderToStaticMarkup(createElement(ReferenceEditor, {
      references: [],
      roles: [],
      disabled: false,
      onAdd: vi.fn(),
      onChange: vi.fn()
    }));

    expect(filled).toContain('同一権威レベル内の優先順位（0～100）');
    expect(filled).toContain('参考資料名');
    expect(filled).toContain('value="binding"');
    expect(empty).toContain('参考資料は登録されていません。');
    expect(filled).not.toContain('REFERENCES');
  });

  it('uses the approved checklist terminology and explicit empty state', () => {
    const project = createProject('existing_document');
    const html = renderToStaticMarkup(createElement(ChecklistEditor, {
      checklist: { ...project.checklist, items: [] },
      defaultRepairPolicy: project.defaultRepairPolicy,
      references: [],
      disabled: false,
      onChecklistChange: vi.fn(),
      onDefaultRepairPolicyChange: vi.fn()
    }));

    expect(html).toContain('プロジェクトの既定修正方針');
    expect(html).toContain('チェック項目が登録されていません。');
    expect(html).toContain('value="suggest_only"');
    expect(html).not.toContain('CHECKLIST');
  });
});
