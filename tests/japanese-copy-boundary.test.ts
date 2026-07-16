import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFile(path, 'utf8');

const rendererFiles = [
  'src/renderer/App.tsx',
  'src/renderer/ProjectWorkspace.tsx',
  'src/renderer/ReferenceEditor.tsx',
  'src/renderer/ChecklistEditor.tsx',
  'src/renderer/CheckItemEditor.tsx'
];

describe('Japanese copy source boundary', () => {
  it('contains no forbidden decorative English headings or obsolete actions', async () => {
    const source = (await Promise.all(rendererFiles.map(read))).join('\n');
    for (const forbidden of [
      '>PROJECT<',
      '>PREFLIGHT<',
      '>OVERVIEW<',
      '>REFERENCES<',
      '>CHECKLIST<',
      'LOCAL DOCUMENT VALIDATION PACKAGE BUILDER',
      '<dt>App</dt>',
      '>保存<',
      '>文書を選択<',
      '生成したZIPを表示'
    ]) {
      expect(source).not.toContain(forbidden);
    }
    expect(source).toContain('<dt>Electron</dt>');
  });

  it('does not import presentation copy into persisted or Copilot package contracts', async () => {
    for (const path of [
      'src/shared/model.ts',
      'src/main/archive.ts',
      'src/main/project-store.ts',
      'src/main/package-generator.ts'
    ]) {
      expect(await read(path)).not.toContain('presentation/ja');
    }
  });

  it('keeps Copilot prompt and Python validator source outside the UI-copy change', async () => {
    const packageSource = await read('src/main/package-generator.ts');
    expect(packageSource).toContain('01_EXECUTION_PROMPT.md');
    expect(packageSource).toContain('validate_output.py');
  });
});
