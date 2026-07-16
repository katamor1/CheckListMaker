import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import { ProjectWorkspace } from '../src/renderer/ProjectWorkspace.js';

describe('Renderer Japanese copy', () => {
  it('uses Japanese headings, actions and explicit empty states', () => {
    const project = createProject('existing_document');
    const html = renderToStaticMarkup(createElement(ProjectWorkspace, {
      project,
      dirty: true,
      activeSection: 'overview',
      issues: [],
      preflightHasRun: false,
      busy: false,
      onSectionChange: vi.fn(),
      onProjectNameChange: vi.fn(),
      onTargetSelect: vi.fn(),
      onGenerationChange: vi.fn(),
      onReferencesSelect: vi.fn(),
      onReferencesChange: vi.fn(),
      onChecklistChange: vi.fn(),
      onDefaultRepairPolicyChange: vi.fn(),
      onSave: vi.fn(),
      onValidate: vi.fn(),
      onExport: vi.fn()
    }));

    expect(html).toContain('プロジェクト');
    expect(html).toContain('未保存の変更あり');
    expect(html).toContain('主対象文書が選択されていません。');
    expect(html).toContain('主対象文書を選択');
    expect(html).toContain('上書き保存');
    expect(html).toContain('事前検査を実行');
    expect(html).not.toMatch(/>PROJECT<|>PREFLIGHT<|>OVERVIEW</);
  });
});
