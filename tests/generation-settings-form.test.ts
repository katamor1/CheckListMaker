import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { DocumentGenerationDefinition } from '../src/shared/model.js';
import { GenerationSettingsForm, applyGenerationPatch } from '../src/renderer/GenerationSettingsForm.js';
import { validateProject } from '../src/shared/validation.js';

const generation: DocumentGenerationDefinition = {
  title: 'リリース計画書',
  purpose: '関係者の合意を得る',
  audience: 'プロジェクト責任者',
  language: 'ja',
  requestedFormat: 'docx',
  instructions: '背景、目的、日程、リスクを含める',
  useReferencesAsFacts: true,
  prohibitUnsupportedClaims: true
};

describe('GenerationSettingsForm', () => {
  it('文書生成モードで必要な設定を編集可能なフォームとして表示する', () => {
    const html = renderToStaticMarkup(
      createElement(GenerationSettingsForm, {
        generation,
        disabled: false,
        onChange: vi.fn()
      })
    );

    expect(html).toContain('name="generation-title"');
    expect(html).toContain('value="リリース計画書"');
    expect(html).toContain('name="generation-purpose"');
    expect(html).toContain('関係者の合意を得る');
    expect(html).toContain('name="generation-audience"');
    expect(html).toContain('name="generation-language"');
    expect(html).toContain('name="generation-format"');
    expect(html).toContain('name="generation-instructions"');
    expect(html).toContain('背景、目的、日程、リスクを含める');
    expect(html).toContain('name="generation-use-references"');
    expect(html).toContain('name="generation-prohibit-unsupported"');
    expect(html).not.toContain('name="generation-title" disabled');
  });

  it('一部の入力変更で他の生成設定を失わない', () => {
    const updated = applyGenerationPatch(generation, { purpose: '承認を得る' });

    expect(updated).toEqual({ ...generation, purpose: '承認を得る' });
    expect(generation.purpose).toBe('関係者の合意を得る');
  });

  it('文書生成指示を入力すると新規生成プロジェクトの事前検査を通過できる', () => {
    const project = createProject('document_generation');
    const generation = applyGenerationPatch(project.generation!, {
      instructions: '背景、目的、日程、リスクを含む計画書を作成する'
    });
    const issues = validateProject({ ...project, generation });
    expect(issues).toEqual([]);
  });
});
