import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readArchive } from '../src/main/archive.js';
import { DocumentRegistry } from '../src/main/document-registry.js';
import { ProjectStore } from '../src/main/project-store.js';
import { validateProject } from '../src/shared/validation.js';

const repositoryRoot = dirname(fileURLToPath(
  new URL('../package.json', import.meta.url)
));
const projectRoot = join(
  repositoryRoot,
  'samples',
  'ja-machine-control-design-review',
  'projects'
);

const cases = [
  {
    mode: 'existing_document',
    file: 'existing-document-demo.clmproj',
    projectId: '00000000-0000-4000-8000-000000000101',
    name: '設備状態監視機能 基本設計レビュー（既存文書）'
  },
  {
    mode: 'document_generation',
    file: 'document-generation-demo.clmproj',
    projectId: '00000000-0000-4000-8000-000000000102',
    name: '設備状態監視機能 基本設計レビュー（文書生成）'
  }
] as const;

describe.each(cases)('$file', ({ mode, file, projectId, name }) => {
  it('opens through ProjectStore with the complete clean demo', async () => {
    const project = await new ProjectStore(
      new DocumentRegistry()
    ).openProject(join(projectRoot, file));

    expect(project).toMatchObject({
      formatVersion: '1.0',
      projectId,
      name,
      mode,
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      defaultRepairPolicy: 'suggest_only'
    });
    expect(project.references.map((item) => item.id)).toEqual([
      'REF-001', 'REF-002', 'REF-003', 'REF-004'
    ]);
    expect(
      project.references.map((item) => item.document.storedPath)
    ).toEqual([
      'references/REF-001.pdf',
      'references/REF-002.md',
      'references/REF-003.txt',
      'references/REF-004.docx'
    ]);
    expect(project.checklist.requiredReferenceRoles).toEqual([
      expect.objectContaining({
        roleId: 'ROLE-001',
        name: '品質基準',
        required: true,
        recommendedAuthorityLevel: 'approved'
      })
    ]);
    expect(project.checklist.items.map((item) => item.id)).toEqual([
      'CHK-0001', 'CHK-0002', 'CHK-0003', 'CHK-0004', 'CHK-0005'
    ]);
    const conditions = project.checklist.items.flatMap(
      (item) => item.conditions
    );
    expect(conditions.map((item) => item.id)).toEqual([
      'COND-01', 'COND-02', 'COND-03', 'COND-04', 'COND-05',
      'COND-06', 'COND-07', 'COND-08', 'COND-09'
    ]);
    expect(new Set(conditions.map((item) => item.type))).toEqual(new Set([
      'semantic', 'required_text', 'forbidden_text', 'number',
      'length_or_count', 'date_or_deadline', 'pattern', 'one_of',
      'cross_source_consistency'
    ]));
    expect(new Set(conditions.map((item) => item.scope.type))).toEqual(
      new Set([
        'entire_document', 'section', 'table', 'semantic_locator'
      ])
    );
    expect(validateProject(project)).toEqual([]);
    if (mode === 'existing_document') {
      expect(project.target?.originalFileName).toBe(
        'basic-design-before-review.docx'
      );
      expect(project.target?.storedPath).toBe('target/TARGET.docx');
      expect(project.generation).toBeUndefined();
    } else {
      expect(project.target).toBeUndefined();
      expect(project.generation).toMatchObject({
        title: '設備状態監視機能 基本設計書',
        requestedFormat: 'docx',
        language: 'ja',
        useReferencesAsFacts: true,
        prohibitUnsupportedClaims: true
      });
      for (const section of [
        '1. 目的', '2. 適用範囲', '3. 構成', '4. 機能設計',
        '5. 異常処理', '6. スケジュール', '7. 承認'
      ]) {
        expect(project.generation?.instructions).toContain(section);
      }
    }
  });

  it('persists no live token or machine-local path', async () => {
    const archive = await readArchive(join(projectRoot, file));
    const projectJson = strFromU8(
      archive.entries.get('project.json') as Uint8Array
    );
    const persisted = JSON.parse(projectJson) as {
      target?: { token: string; storedPath: string };
      references: Array<{
        document: { token: string; storedPath: string };
      }>;
    };

    expect(persisted.target?.token ?? '').toBe('');
    expect(
      persisted.references.every(
        (reference) => reference.document.token === ''
      )
    ).toBe(true);
    expect(projectJson).not.toMatch(/[A-Za-z]:[\\/]/);
    expect(projectJson).not.toContain('\\\\');
  });
});

it('regenerates committed projects byte-for-byte', () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npm,
    ['run', 'samples:projects:check'],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      timeout: 60_000
    }
  );

  expect(
    result.status,
    result.stdout + result.stderr
  ).toBe(0);
}, 70_000);

it('wires deterministic checking into samples and Windows CI', async () => {
  const packageJson = JSON.parse(
    await readFile(join(repositoryRoot, 'package.json'), 'utf8')
  ) as { scripts: Record<string, string> };
  const workflow = await readFile(
    join(repositoryRoot, '.github/workflows/electron-ci.yml'),
    'utf8'
  );

  expect(packageJson.scripts['verify:samples']).toContain(
    'samples:projects:check'
  );
  expect(workflow).toContain('npm run samples:projects:check');
});
