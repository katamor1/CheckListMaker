# Electron GUI Full Sample Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (<code>- [ ]</code>) syntax for tracking.

**Goal:** Add reproducible, self-contained existing-document and document-generation project files so the full Electron GUI demo can start without manually entering every field.

**Architecture:** A sample-only Node.js generator builds both archives through the compiled production ProjectStore and DocumentRegistry, with fixed IDs, timestamps, ordering, and production validation. The Python sample catalog registers each archive as a mode-specific project entry point, while Vitest opens the committed files through the production reader and checks the complete 4-reference, 5-item, 9-condition contract.

**Tech Stack:** Node.js 22 ESM, TypeScript 5.9, Vitest 3, Python 3.12 unittest, fflate through the production archive layer, Electron 41, Markdown, python-docx.

## Global Constraints

- Use the approved design at docs/superpowers/specs/2026-07-16-electron-full-sample-projects-design.md as the sole feature specification.
- Work in the current main checkout; do not create a worktree or another branch.
- Do not add runtime or development dependencies.
- Do not change the .clmproj archive format, ProjectStore persistence contract, IPC contract, or GUI layout.
- Add exactly two self-contained project files: existing-document-demo.clmproj and document-generation-demo.clmproj.
- Use fixed project IDs 00000000-0000-4000-8000-000000000101 and 00000000-0000-4000-8000-000000000102.
- Use fixed createdAt and updatedAt values of 2026-07-16T00:00:00.000Z.
- Both projects must contain four references, ROLE-001, five checklist items, nine conditions, all nine condition types, all four scope types, and zero preflight issues.
- Keep the existing detailed GUI entry instructions; add the completed projects as a quick-start path.
- Keep .clmcheck and runtime result.json outside the sample catalog.
- Treat .clmproj as unencrypted binary content containing the source documents.
- Use explicit paths when staging commits; do not stage unrelated work.

## Execution preflight

- [ ] Confirm the design commit is present and the tracked tree is clean.

Run:

~~~powershell
git merge-base --is-ancestor 207a4ad HEAD
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git status --short
~~~

Expected: the ancestor check exits 0 and status prints nothing.

- [ ] Record the execution base and run the current repository gates before changing code.

Run:

~~~powershell
$executionBase = git rev-parse HEAD
$executionBase
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run verify:samples
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git diff --check
~~~

Expected: every command exits 0. Stop and report a baseline failure instead of implementing over it.

---

### Task 1: Add the project entry-point contract and reproducible sample projects

**Files:**
- Modify: samples/validate_samples.py:26-72 and 802-890
- Modify: tests/sample_catalog/test_validate_samples.py:20-75, 430-575, 626-750, and 1180-1220

**Interfaces:**
- Consumes: the existing manifest files array and mode-specific entryPoints objects.
- Produces: PURPOSES containing project_file; MEDIA_BY_SUFFIX containing .clmproj; required projectPath on both entry-point shapes; _ENTRY_POINT_FILES mappings from projectPath to project_file.

- [ ] **Step 1: Update synthetic fixtures and write failing contract tests**

In both synthetic repository builders in tests/sample_catalog/test_validate_samples.py, add a distinct project payload to every enabled mode. The existing-document fixture must contain this exact shape:

~~~python
project_file = b"PK\x03\x04existing project\n"
(sample_directory / "existing.clmproj").write_bytes(project_file)

manifest["entryPoints"]["existing_document"]["projectPath"] = (
    "existing.clmproj"
)
manifest["files"].append({
    "mediaType": "application/vnd.checklistmaker.project+zip",
    "path": "existing.clmproj",
    "purpose": "project_file",
    "sha256": hashlib.sha256(project_file).hexdigest(),
    "sizeBytes": len(project_file),
})
~~~

Update ValidatorContractAndMutationTests.add_generation_mode so it adds this payload and field with that class's existing file-entry helper:

~~~python
project_file = b"PK\x03\x04generation project\n"
self.add_payload(
    root,
    "generation.clmproj",
    "project_file",
    "application/vnd.checklistmaker.project+zip",
    project_file,
)

entry_point = {
    "projectPath": "generation.clmproj",
    "referenceIds": [],
    "requestPath": "request.json",
}
~~~

Update test_schema_matches_public_validator_constants with these exact additions:

~~~python
expected_purposes = frozenset({
    "documentation", "target_document", "expected_outcomes",
    "generation_request", "reference_document", "project_file",
})
expected_media = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".docx": (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    ),
    ".clmproj": "application/vnd.checklistmaker.project+zip",
}
~~~

Add these focused tests:

~~~python
def test_each_enabled_mode_requires_a_project_file(self):
    root = self.make_repo()
    self.mutate_manifest(
        root,
        lambda manifest: manifest["entryPoints"][
            "existing_document"].pop("projectPath"),
    )
    self.assert_issue(root, "PROPERTY_MISSING")

    root = self.make_repo()
    self.add_generation_mode(root)
    self.mutate_manifest(
        root,
        lambda manifest: manifest["entryPoints"][
            "document_generation"].pop("projectPath"),
    )
    self.assert_issue(root, "PROPERTY_MISSING")

def test_project_entry_point_requires_project_file_purpose(self):
    root = self.make_repo()
    self.mutate_manifest(
        root,
        lambda manifest: manifest["entryPoints"][
            "existing_document"].update(
                {"projectPath": "target.txt"}),
    )
    self.assert_issue(root, "ENTRY_POINT_FILE_UNKNOWN")
~~~

Adjust the synthetic success assertions at lines 610, 626, and 1265 from 2 to 3 files for one mode and from 4 to 6 files for the fixture containing a reference and both modes.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

~~~powershell
python -m unittest tests.sample_catalog.test_validate_samples.ValidatorContractAndMutationTests.test_schema_matches_public_validator_constants -v
python -m unittest tests.sample_catalog.test_validate_samples.ValidatorContractAndMutationTests.test_each_enabled_mode_requires_a_project_file -v
~~~

Expected: the constants test fails because project_file and .clmproj are unsupported; the required-field test fails because projectPath is not part of _ENTRY_POINT_KEYS.

- [ ] **Step 3: Implement the catalog contract**

Make these exact constant changes in samples/validate_samples.py:

~~~python
PURPOSES = frozenset({
    "documentation", "target_document", "expected_outcomes",
    "generation_request", "reference_document", "project_file",
})
MEDIA_BY_SUFFIX = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".docx": (
        "application/vnd.openxmlformats-officedocument."
        "wordprocessingml.document"
    ),
    ".clmproj": "application/vnd.checklistmaker.project+zip",
}
_ENTRY_POINT_KEYS = {
    "existing_document": frozenset({
        "targetPath", "expectedOutcomesPath", "projectPath",
        "referenceIds",
    }),
    "document_generation": frozenset({
        "requestPath", "projectPath", "referenceIds",
    }),
}
_ENTRY_POINT_FILES = {
    "existing_document": (
        ("targetPath", "target_document"),
        ("expectedOutcomesPath", "expected_outcomes"),
        ("projectPath", "project_file"),
    ),
    "document_generation": (
        ("requestPath", "generation_request"),
        ("projectPath", "project_file"),
    ),
}
~~~

Do not add ZIP parsing to the Python catalog validator. Archive structure is validated by the production ProjectStore tests in Task 1B.

- [ ] **Step 4: Run the synthetic contract suite**

Run:

~~~powershell
python -m unittest tests.sample_catalog.test_validate_samples.ValidatorContractAndMutationTests -v
~~~

Expected: all synthetic contract tests pass. The registered repository sample is not yet updated, so continue directly into Task 1B without committing or claiming Task 1 complete.

---

#### Task 1B: Generate, register, and verify both full sample projects

**Files:**
- Create: samples/tools/build_sample_projects.mjs
- Create: samples/ja-machine-control-design-review/projects/existing-document-demo.clmproj
- Create: samples/ja-machine-control-design-review/projects/document-generation-demo.clmproj
- Create: tests/sample-projects.test.ts
- Modify: package.json:8-21
- Modify: samples/tools/update_sample_manifest.py:28-115
- Modify: samples/ja-machine-control-design-review/sample-manifest.json
- Modify: tests/sample_catalog/test_update_sample_manifest.py:22-90
- Modify: tests/sample_catalog/test_00_refreshed_sample_snapshot.py:10-45
- Modify: tests/sample_catalog/test_sample_content.py:279-313
- Modify: tests/sample_catalog/test_validate_samples.py:1335-1425
- Modify: .github/workflows/electron-ci.yml:62-69

**Interfaces:**
- Consumes: ProjectStore, DocumentRegistry, validateProject, the existing target and four reference source files, generation/document-request.json, and the Task 1 project_file catalog contract.
- Produces: buildSampleProjects(options), checkSampleProjects(options), CLI modes --write and --check, two deterministic .clmproj files, projectPath entries in sample-manifest.json, and CI enforcement.

- [ ] **Step 1: Write the failing end-to-end project tests**

Create tests/sample-projects.test.ts with real production reads and these assertions:

~~~typescript
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
});

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
~~~

- [ ] **Step 2: Run the test and verify RED**

Run:

~~~powershell
npm.cmd test -- tests/sample-projects.test.ts
~~~

Expected: FAIL because both project files and the samples:projects:check package script do not exist.

- [ ] **Step 3: Implement the fixed complete checklist definition**

In samples/tools/build_sample_projects.mjs, create a createChecklist function with this exact semantic content:

~~~javascript
const needsInformation = { onNotFound: 'needs_information' };

const createChecklist = () => ({
  name: '基本設計レビュー完全チェックリスト',
  description:
    '設備状態監視機能の基本設計を九つの条件で確認するデモ用チェックリスト',
  retiredCheckItemIds: [],
  retiredConditionIds: [],
  requiredReferenceRoles: [{
    roleId: 'ROLE-001',
    name: '品質基準',
    description: '品質規則と承認済み構成を提供する参考資料',
    required: true,
    recommendedAuthorityLevel: 'approved'
  }],
  items: [
    {
      id: 'CHK-0001',
      title: '目的と適用範囲',
      description: '目的の具体性と適用範囲の必須語句を確認する',
      required: true,
      allowNotApplicable: false,
      conditionLogic: 'all',
      conditions: [
        {
          id: 'COND-01',
          type: 'semantic',
          instruction: '目的が具体的で検証可能であること',
          scope: { type: 'entire_document', ...needsInformation }
        },
        {
          id: 'COND-02',
          type: 'required_text',
          values: ['対象', '除外'],
          matchMode: 'all',
          caseSensitive: false,
          scope: {
            type: 'section',
            heading: '2. 適用範囲',
            matchMode: 'exact',
            includeSubsections: true,
            ...needsInformation
          }
        }
      ]
    },
    {
      id: 'CHK-0002',
      title: '曖昧表現と主要パラメータ',
      description: '曖昧表現と監視周期の上限を確認する',
      required: true,
      allowNotApplicable: false,
      conditionLogic: 'any',
      repairPolicy: 'auto_fix',
      conditions: [
        {
          id: 'COND-03',
          type: 'forbidden_text',
          values: ['適切に', '必要に応じて'],
          caseSensitive: false,
          scope: { type: 'entire_document', ...needsInformation }
        },
        {
          id: 'COND-04',
          type: 'number',
          subject: '監視周期',
          operator: 'less_than_or_equal',
          value: 250,
          unit: 'ms',
          scope: {
            type: 'table',
            description: '主要パラメータ',
            expectedColumns: [],
            ...needsInformation
          }
        }
      ]
    },
    {
      id: 'CHK-0003',
      title: '承認とスケジュール',
      description: '承認手順と改訂日の基準を確認する',
      required: true,
      allowNotApplicable: false,
      conditionLogic: 'all',
      repairPolicy: 'do_not_modify',
      conditions: [
        {
          id: 'COND-05',
          type: 'length_or_count',
          measure: 'occurrences',
          operator: 'less_than_or_equal',
          value: 0,
          occurrenceText: '未定',
          scope: {
            type: 'table',
            description: '承認情報',
            expectedColumns: [],
            ...needsInformation
          }
        },
        {
          id: 'COND-06',
          type: 'date_or_deadline',
          subject: '改訂日',
          operator: 'on_or_after',
          value: '2026-07-01',
          scope: { type: 'entire_document', ...needsInformation }
        }
      ]
    },
    {
      id: 'CHK-0004',
      title: '文書情報',
      description: '管理番号と機密区分を確認する',
      required: true,
      allowNotApplicable: false,
      conditionLogic: 'any',
      repairPolicy: 'suggest_only',
      conditions: [
        {
          id: 'COND-07',
          type: 'pattern',
          preset: 'custom',
          pattern: '^DMS-[0-9]{4}$',
          description: '管理番号がDMS-####形式であること',
          scope: { type: 'entire_document', ...needsInformation }
        },
        {
          id: 'COND-08',
          type: 'one_of',
          subject: '機密区分',
          allowedValues: ['公開', '社内', '機密'],
          scope: { type: 'entire_document', ...needsInformation }
        }
      ]
    },
    {
      id: 'CHK-0005',
      title: '参考資料整合性',
      description: '監視周期と用語定義を参考資料間で照合する',
      required: false,
      allowNotApplicable: true,
      conditionLogic: 'all',
      repairPolicy: 'auto_fix',
      conditions: [{
        id: 'COND-09',
        type: 'cross_source_consistency',
        instruction:
          '監視周期を選択したすべての参考資料と照合すること',
        sourceIds: ['REF-001', 'REF-002', 'REF-003', 'REF-004'],
        scope: {
          type: 'semantic_locator',
          description: '監視周期と用語定義',
          ...needsInformation
        }
      }]
    }
  ]
});
~~~

- [ ] **Step 4: Implement the production-backed generator**

The generator must export SAMPLE_PROJECTS as a frozen array, buildSampleProjects({ repositoryRoot, outputRoot, api }) as Promise<void>, checkSampleProjects({ repositoryRoot, committedProjectRoot, api }) as Promise<void>, and main(argv) as Promise<number>. Define SAMPLE_PROJECTS exactly as follows:

~~~javascript
export const SAMPLE_PROJECTS = Object.freeze([
  {
    mode: 'existing_document',
    fileName: 'existing-document-demo.clmproj',
    projectId: '00000000-0000-4000-8000-000000000101',
    name: '設備状態監視機能 基本設計レビュー（既存文書）'
  },
  {
    mode: 'document_generation',
    fileName: 'document-generation-demo.clmproj',
    projectId: '00000000-0000-4000-8000-000000000102',
    name: '設備状態監視機能 基本設計レビュー（文書生成）'
  }
]);
~~~

Use these imports and constants:

~~~javascript
import {
  mkdir, mkdtemp, readFile, rm
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const sampleRoot = join(
  repositoryRoot,
  'samples',
  'ja-machine-control-design-review'
);
const committedProjectRoot = join(sampleRoot, 'projects');
const fixedTimestamp = '2026-07-16T00:00:00.000Z';
~~~

Build references through one fresh registry per project:

~~~javascript
const referenceDefinitions = [
  {
    id: 'REF-001',
    sourcePath: 'references/quality-assurance-policy.pdf',
    storedPath: 'references/REF-001.pdf',
    title: '品質保証規程（デモ）',
    purpose: '必須品質規則と禁止事項',
    authorityLevel: 'binding',
    priority: 100,
    roleIds: ['ROLE-001']
  },
  {
    id: 'REF-002',
    sourcePath: 'references/basic-design-template.md',
    storedPath: 'references/REF-002.md',
    title: '基本設計テンプレート',
    purpose: '必須章、記載項目、順序',
    authorityLevel: 'approved',
    priority: 80,
    roleIds: ['ROLE-001']
  },
  {
    id: 'REF-003',
    sourcePath: 'references/control-terminology.txt',
    storedPath: 'references/REF-003.txt',
    title: '制御用語集',
    purpose: '用語と表記の統一',
    authorityLevel: 'working',
    priority: 60,
    roleIds: []
  },
  {
    id: 'REF-004',
    sourcePath: 'references/reference-design.docx',
    storedPath: 'references/REF-004.docx',
    title: '設備状態監視機能 参考設計書',
    purpose: '上位資料と矛盾しない記述例',
    authorityLevel: 'reference',
    priority: 40,
    roleIds: []
  }
];

const createReferences = async (registry, root) => Promise.all(
  referenceDefinitions.map(async (definition) => {
    const document = await registry.registerPath(
      join(root, definition.sourcePath),
      definition.storedPath
    );
    return {
      id: definition.id,
      document,
      title: definition.title,
      purpose: definition.purpose,
      authorityLevel: definition.authorityLevel,
      priority: definition.priority,
      roleIds: [...definition.roleIds],
      readOnly: true
    };
  })
);
~~~

buildSampleProjects must construct each project with the fixed common fields, read generation/document-request.json for the generation object, call validateProject, reject any non-empty issue list, and save through ProjectStore:

~~~javascript
export const buildSampleProjects = async ({
  repositoryRoot: root,
  outputRoot,
  api
}) => {
  const scenarioRoot = join(
    root,
    'samples',
    'ja-machine-control-design-review'
  );
  await mkdir(outputRoot, { recursive: true });
  const generation = JSON.parse(await readFile(
    join(scenarioRoot, 'generation', 'document-request.json'),
    'utf8'
  ));

  for (const scenario of SAMPLE_PROJECTS) {
    const registry = new api.DocumentRegistry();
    const references = await createReferences(registry, scenarioRoot);
    const common = {
      formatVersion: '1.0',
      projectId: scenario.projectId,
      name: scenario.name,
      mode: scenario.mode,
      references,
      checklist: createChecklist(),
      origin: { type: 'created_in_project' },
      defaultRepairPolicy: 'suggest_only',
      createdAt: fixedTimestamp,
      updatedAt: fixedTimestamp
    };
    const project = scenario.mode === 'existing_document'
      ? {
          ...common,
          target: await registry.registerPath(
            join(
              scenarioRoot,
              'existing-document',
              'target',
              'basic-design-before-review.docx'
            ),
            'target/TARGET.docx'
          )
        }
      : { ...common, generation };
    const issues = api.validateProject(project);
    if (issues.length !== 0) {
      throw new Error(
        'sample validation failed: ' +
        issues.map((issue) => issue.code).join(',')
      );
    }
    await new api.ProjectStore(registry).saveProject(
      join(outputRoot, scenario.fileName),
      project
    );
  }
};
~~~

checkSampleProjects must generate to an owned temporary directory, compare each file with Buffer.equals, and always remove the temporary directory:

~~~javascript
export const checkSampleProjects = async (options) => {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'checklistmaker-sample-projects-')
  );
  try {
    await buildSampleProjects({
      ...options,
      outputRoot: temporaryRoot
    });
    for (const scenario of SAMPLE_PROJECTS) {
      const expected = await readFile(
        join(options.committedProjectRoot, scenario.fileName)
      );
      const actual = await readFile(
        join(temporaryRoot, scenario.fileName)
      );
      if (!expected.equals(actual)) {
        throw new Error(
          'sample project is out of date: ' + scenario.fileName
        );
      }
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
};
~~~

main must accept exactly one of --write and --check, dynamically import the compiled production modules, and return 0 on success, 1 on stale or failed generation, and 2 on invalid CLI usage:

~~~javascript
const loadApi = async () => {
  const [
    { ProjectStore },
    { DocumentRegistry },
    { validateProject }
  ] = await Promise.all([
    import('../../dist/main/project-store.js'),
    import('../../dist/main/document-registry.js'),
    import('../../dist/shared/validation.js')
  ]);
  return { ProjectStore, DocumentRegistry, validateProject };
};

export const main = async (argv = process.argv.slice(2)) => {
  if (
    argv.length !== 1 ||
    !['--write', '--check'].includes(argv[0])
  ) {
    console.error('choose exactly one of --write or --check');
    return 2;
  }
  try {
    const api = await loadApi();
    if (argv[0] === '--write') {
      await buildSampleProjects({
        repositoryRoot,
        outputRoot: committedProjectRoot,
        api
      });
    } else {
      await checkSampleProjects({
        repositoryRoot,
        committedProjectRoot,
        api
      });
    }
    return 0;
  } catch (error) {
    console.error(
      error instanceof Error
        ? error.message
        : 'sample project generation failed'
    );
    return 1;
  }
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
~~~

- [ ] **Step 5: Add package scripts and CI enforcement**

Add these scripts to package.json:

~~~json
"samples:projects:write": "npm run build:main && node samples/tools/build_sample_projects.mjs --write",
"samples:projects:check": "npm run build:main && node samples/tools/build_sample_projects.mjs --check",
"verify:samples": "npm run test:samples && npm run validate:samples && npm run samples:projects:check"
~~~

In the Validate reusable sample catalog workflow step, add:

~~~powershell
npm run samples:projects:check 2>&1 | Tee-Object -FilePath artifacts/ci/sample-projects.log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
~~~

- [ ] **Step 6: Generate the two archives**

Run:

~~~powershell
npm.cmd run samples:projects:write
~~~

Expected: both files are created under samples/ja-machine-control-design-review/projects and a second run produces identical SHA-256 values.

Verify determinism:

~~~powershell
$before = Get-FileHash -Algorithm SHA256 samples/ja-machine-control-design-review/projects/*.clmproj
npm.cmd run samples:projects:write
$after = Get-FileHash -Algorithm SHA256 samples/ja-machine-control-design-review/projects/*.clmproj
Compare-Object $before $after -Property Path,Hash
~~~

Expected: Compare-Object prints nothing.

- [ ] **Step 7: Register the generated files in the manifest builder**

Add these entries to _FILE_METADATA in samples/tools/update_sample_manifest.py:

~~~python
"projects/document-generation-demo.clmproj": (
    "project_file",
    "application/vnd.checklistmaker.project+zip",
),
"projects/existing-document-demo.clmproj": (
    "project_file",
    "application/vnd.checklistmaker.project+zip",
),
~~~

Add these exact projectPath values to _FIXED_METADATA entryPoints:

~~~python
"existing_document": {
    "targetPath": (
        "existing-document/target/basic-design-before-review.docx"
    ),
    "expectedOutcomesPath": (
        "existing-document/expected-outcomes.json"
    ),
    "projectPath": "projects/existing-document-demo.clmproj",
    "referenceIds": ["REF-001", "REF-002", "REF-003", "REF-004"],
},
"document_generation": {
    "requestPath": "generation/document-request.json",
    "projectPath": "projects/document-generation-demo.clmproj",
    "referenceIds": ["REF-001", "REF-002", "REF-003", "REF-004"],
},
~~~

Update EXPECTED_PATHS, EXPECTED_FILE_METADATA, and EXPECTED_ENTRY_POINTS in tests/sample_catalog/test_update_sample_manifest.py with the same paths, purposes, media type, and projectPath fields.

Extend test_manifest_matches_payload_hashes_and_reference_metadata in tests/sample_catalog/test_sample_content.py with these exact assertions:

~~~python
self.assertEqual(
    "projects/existing-document-demo.clmproj",
    manifest["entryPoints"]["existing_document"]["projectPath"],
)
self.assertEqual(
    "projects/document-generation-demo.clmproj",
    manifest["entryPoints"]["document_generation"]["projectPath"],
)
~~~

Run the manifest writer:

~~~powershell
python samples/tools/update_sample_manifest.py --write
~~~

Use this command to emit exact size and SHA-256 pairs for the two binary snapshot entries, then add its exact output to RegisteredSampleCatalogTests.EXPECTED_PAYLOADS via tests/sample_catalog/test_00_refreshed_sample_snapshot.py:

~~~powershell
@'
from pathlib import Path
import hashlib
root = Path("samples/ja-machine-control-design-review")
for path in sorted((root / "projects").glob("*.clmproj")):
    payload = path.read_bytes()
    relative = path.relative_to(root).as_posix()
    print(repr(relative) + ": (" + str(len(payload)) + ", " +
          repr(hashlib.sha256(payload).hexdigest()) + "),")
'@ | python -
~~~

Update the registered-sample success summary from files=8 to files=10.

- [ ] **Step 8: Run focused GREEN checks**

Run:

~~~powershell
npm.cmd test -- tests/sample-projects.test.ts
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python -m unittest tests.sample_catalog.test_update_sample_manifest -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python -m unittest tests.sample_catalog.test_validate_samples.RegisteredSampleCatalogTests -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python samples/validate_samples.py --root .
~~~

Expected: all tests pass and the validator prints OK samples=1 files=10.

- [ ] **Step 9: Run the Task 1 broad gate**

Run:

~~~powershell
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run verify:samples
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git diff --check
~~~

Expected: all commands exit 0.

- [ ] **Step 10: Commit Task 1**

Run:

~~~powershell
git add -- package.json .github/workflows/electron-ci.yml samples/tools/build_sample_projects.mjs samples/tools/update_sample_manifest.py samples/ja-machine-control-design-review/projects/existing-document-demo.clmproj samples/ja-machine-control-design-review/projects/document-generation-demo.clmproj samples/ja-machine-control-design-review/sample-manifest.json tests/sample-projects.test.ts tests/sample_catalog/test_update_sample_manifest.py tests/sample_catalog/test_00_refreshed_sample_snapshot.py tests/sample_catalog/test_sample_content.py tests/sample_catalog/test_validate_samples.py
git diff --cached --check
git commit -m "feat: add reproducible full sample projects"
~~~

Expected: one coherent Task 1 commit that leaves npm run verify:samples green.

---

### Task 2: Add the five-minute quick demo and synchronized Word guide

**Files:**
- Modify: samples/README.md:1-14
- Modify: samples/ja-machine-control-design-review/README.md:5-15
- Modify: docs/user-guide/samples-gui-demo.md:12-45
- Modify: docs/user-guide/samples-gui-demo.docx
- Modify: tests/sample_catalog/test_sample_content.py:155-180 and 314-340
- Modify: tests/sample_catalog/test_00_refreshed_sample_snapshot.py:10-28
- Modify: samples/ja-machine-control-design-review/sample-manifest.json

**Interfaces:**
- Consumes: both projectPath values and filenames from Task 1.
- Produces: a five-minute quick-start that opens, preflights, Save-As copies, and exports either completed project while retaining the detailed manual build instructions.

- [ ] **Step 1: Write failing Markdown and Word content tests**

Replace the obsolete assertion that completed .clmproj files are absent. Require these phrases in the scenario README:

~~~python
for phrase in (
    "完成済みプロジェクトから始める",
    "projects/existing-document-demo.clmproj",
    "projects/document-generation-demo.clmproj",
    "名前を付けて保存",
    "詳細入力手順",
):
    self.assertIn(phrase, text)
self.assertNotIn(
    "編集済みの`.clmproj`または`.clmcheck`を同梱しません",
    text,
)
~~~

Require these phrases in docs/user-guide/samples-gui-demo.md:

~~~python
for phrase in (
    "## 1. 5分クイックデモ",
    "existing-document-demo.clmproj",
    "document-generation-demo.clmproj",
    "`プロジェクトを開く`",
    "`名前を付けて保存`",
    "エラー0・警告0",
    "## 6. 既存文書レビュー・プロジェクトの作成",
):
    self.assertIn(phrase, text)
~~~

Add a DOCX text test using python-docx:

~~~python
from docx import Document

def test_word_guide_contains_the_full_sample_quick_start(self):
    document = Document(
        self.REPOSITORY_ROOT /
        "docs/user-guide/samples-gui-demo.docx"
    )
    text_parts = [paragraph.text for paragraph in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            text_parts.extend(cell.text for cell in row.cells)
    text = "\n".join(text_parts)
    for phrase in (
        "5分クイックデモ",
        "existing-document-demo.clmproj",
        "document-generation-demo.clmproj",
        "名前を付けて保存",
        "エラー0・警告0",
    ):
        self.assertIn(phrase, text)
~~~

Add this repository-level catalog README test:

~~~python
def test_samples_readme_explains_project_and_result_boundaries(self):
    text = self.read(self.REPOSITORY_ROOT / "samples/README.md")
    for phrase in (
        "existing-document-demo.clmproj",
        "document-generation-demo.clmproj",
        "`.clmcheck`",
        "`result.json`",
    ):
        self.assertIn(phrase, text)
    self.assertIn("暗号化されません", text)
~~~

- [ ] **Step 2: Run the focused content tests and verify RED**

Run:

~~~powershell
python -m unittest tests.sample_catalog.test_sample_content.SampleContentTests.test_scenario_readme_describes_current_main_gui -v
python -m unittest tests.sample_catalog.test_sample_content.SampleContentTests.test_gui_guide_has_no_obsolete_electron_instructions -v
python -m unittest tests.sample_catalog.test_sample_content.SampleContentTests.test_word_guide_contains_the_full_sample_quick_start -v
python -m unittest tests.sample_catalog.test_sample_content.SampleContentTests.test_samples_readme_explains_project_and_result_boundaries -v
~~~

Expected: FAIL because the old text excludes completed projects and neither guide contains the quick-start section.

- [ ] **Step 3: Update the Markdown documentation**

Update samples/README.md to state that the catalog now includes two editable .clmproj starter files, while .clmcheck and runtime result.json remain excluded.

Replace the opening exclusion paragraph in the scenario README with a section named 完成済みプロジェクトから始める. List both exact relative paths and require 名前を付けて保存 before editing. Keep the existing ID-order and manual-entry details under a sentence that identifies them as 詳細入力手順.

Insert this flow before the existing file inventory in docs/user-guide/samples-gui-demo.md and renumber subsequent top-level sections without deleting their content:

~~~markdown
## 1. 5分クイックデモ

### 1.1 既存文書レビュー

1. `プロジェクトを開く`をクリックする。
2. `samples\ja-machine-control-design-review\projects\existing-document-demo.clmproj`を選択する。
3. 主対象1件、参考資料4件、チェック項目5件、条件9件を確認する。
4. `事前検査`を実行し、エラー0・警告0を確認する。
5. 編集前に`名前を付けて保存`を実行し、TEMPまたは任意の作業フォルダへコピーする。
6. 必要な項目だけ変更し、`Copilot用ZIPを作成`を実行する。

### 1.2 文書生成

1. `プロジェクトを開く`をクリックする。
2. `samples\ja-machine-control-design-review\projects\document-generation-demo.clmproj`を選択する。
3. 文書生成設定、参考資料4件、チェック項目5件、条件9件を確認する。
4. `事前検査`を実行し、エラー0・警告0を確認する。
5. 編集前に`名前を付けて保存`を実行し、作業コピーを作る。
6. 必要な生成指示だけ変更し、`Copilot用ZIPを作成`を実行する。

> `.clmproj`は暗号化されず、主対象文書と参考資料の実体を含みます。
~~~

Retain the detailed manual sections and identify them as the manual rebuild and field-verification route.

- [ ] **Step 4: Regenerate and visually verify the Word guide**

Before editing the DOCX, invoke the doc skill and read its SKILL.md completely. Confirm pandoc, Microsoft Word COM, and pdftoppm are available, then regenerate the Word file through the existing document as a style reference:

~~~powershell
Get-Command pandoc,pdftoppm -ErrorAction Stop
$wordPath = 'C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE'
if (-not (Test-Path -LiteralPath $wordPath)) {
  throw 'Microsoft Word is required for rendered DOCX verification.'
}
$renderRoot = Join-Path $env:TEMP (
  'checklistmaker-sample-guide-' + [guid]::NewGuid().ToString('N')
)
New-Item -ItemType Directory -Force -Path $renderRoot | Out-Null
$source = Resolve-Path 'docs/user-guide/samples-gui-demo.md'
$reference = Resolve-Path 'docs/user-guide/samples-gui-demo.docx'
$generated = Join-Path $renderRoot 'samples-gui-demo.docx'
pandoc $source --from=gfm --to=docx --reference-doc=$reference --output=$generated
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
@'
from docx import Document
import sys
Document(sys.argv[1])
'@ | python - $generated
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Move-Item -LiteralPath $generated -Destination $reference -Force
~~~

Render the regenerated DOCX through Microsoft Word and Poppler:

~~~powershell
$docx = (Resolve-Path 'docs/user-guide/samples-gui-demo.docx').Path
$pdf = Join-Path $renderRoot 'samples-gui-demo.pdf'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
try {
  $document = $word.Documents.Open($docx)
  try {
    $document.ExportAsFixedFormat($pdf, 17)
  } finally {
    $document.Close($false)
  }
} finally {
  $word.Quit()
}
pdftoppm -png -r 150 $pdf (Join-Path $renderRoot 'page')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Get-ChildItem -LiteralPath $renderRoot -Filter 'page-*.png' |
  Sort-Object Name |
  Select-Object FullName,Length
~~~

Inspect every rendered PNG with view_image for clipped text, overlapping tables, orphaned headings, missing Japanese glyphs, and inconsistent page breaks. Repeat regeneration after any layout correction. Remove renderRoot after the visual review; do not commit the PDF or PNG files.

Run the focused Word test again:

~~~powershell
python -m unittest tests.sample_catalog.test_sample_content.SampleContentTests.test_word_guide_contains_the_full_sample_quick_start -v
~~~

Expected: PASS.

- [ ] **Step 5: Refresh the scenario manifest after README changes**

Run:

~~~powershell
python samples/tools/update_sample_manifest.py --write
python samples/tools/update_sample_manifest.py --check
~~~

Emit the new README.md size and hash and replace its entry in REFRESHED_PAYLOADS:

~~~powershell
@'
from pathlib import Path
import hashlib
path = Path("samples/ja-machine-control-design-review/README.md")
payload = path.read_bytes()
print(len(payload), hashlib.sha256(payload).hexdigest())
'@ | python -
~~~

- [ ] **Step 6: Run documentation and sample GREEN checks**

Run:

~~~powershell
python -m unittest tests.sample_catalog.test_sample_content -v
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run verify:samples
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git diff --check
~~~

Expected: all commands exit 0 and the sample validator prints OK samples=1 files=10.

- [ ] **Step 7: Commit Task 2**

Run:

~~~powershell
git add -- samples/README.md samples/ja-machine-control-design-review/README.md samples/ja-machine-control-design-review/sample-manifest.json docs/user-guide/samples-gui-demo.md docs/user-guide/samples-gui-demo.docx tests/sample_catalog/test_sample_content.py tests/sample_catalog/test_00_refreshed_sample_snapshot.py
git diff --cached --check
git commit -m "docs: add full sample project quick start"
~~~

Expected: one documentation commit with no rendered or temporary assets.

---

### Task 3: Verify both projects in the production Electron GUI

**Files:**
- Verify: samples/ja-machine-control-design-review/projects/existing-document-demo.clmproj
- Verify: samples/ja-machine-control-design-review/projects/document-generation-demo.clmproj
- Verify: all files changed since the execution base
- Test only if a defect is found: tests/sample-projects.test.ts or the closest existing session/renderer test

**Interfaces:**
- Consumes: the committed project files, quick-start guide, production build, and actual Electron file dialogs.
- Produces: GUI evidence for both modes, clean temporary-resource ownership, and final all-gates evidence.

- [ ] **Step 1: Run the full automated gate from a clean build**

Run:

~~~powershell
npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run verify:samples
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run samples:projects:check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
git diff --check
~~~

Expected: every command exits 0.

- [ ] **Step 2: Start one owned production Electron instance**

Invoke the computer-use skill and read its SKILL.md completely before controlling the GUI. Create a unique TEMP root and user-data profile, record the exact Electron PID and start time, and launch the production build visibly:

~~~powershell
$runId = [guid]::NewGuid().ToString('N')
$evidenceRoot = Join-Path $env:TEMP "checklistmaker-full-sample-$runId"
$profile = Join-Path $evidenceRoot 'profile'
New-Item -ItemType Directory -Force -Path $profile | Out-Null
$electron = Resolve-Path 'node_modules/.bin/electron.cmd'
$process = Start-Process -FilePath $electron -ArgumentList @(
  '.',
  "--user-data-dir=$profile"
) -PassThru
$process | Select-Object Id,StartTime,Path
~~~

Expected: one visible CheckListMaker window owned by the recorded PID.

- [ ] **Step 3: Verify the existing-document quick demo**

Using the actual GUI:

1. Click プロジェクトを開く.
2. Select existing-document-demo.clmproj.
3. Verify the project name and existing-document mode.
4. Verify basic-design-before-review.docx is the target.
5. Verify 参考資料 4, ROLE-001, five item panels, and COND-01 through COND-09.
6. Run 事前検査 and verify エラー0・警告0.
7. Use 名前を付けて保存 to write an owned TEMP copy.
8. Edit one harmless text field, save, open the generation sample, then reopen the TEMP copy and verify the edit persists.
9. Create a Copilot ZIP in the owned TEMP root and confirm it exists.

- [ ] **Step 4: Verify the document-generation quick demo**

Using the same owned GUI instance:

1. Open document-generation-demo.clmproj.
2. Verify the project name and document-generation mode.
3. Verify title, audience, purpose, Japanese language, DOCX format, both fact switches, and the seven-section generation instruction.
4. Verify 参考資料 4, ROLE-001, five item panels, and COND-01 through COND-09.
5. Run 事前検査 and verify エラー0・警告0.
6. Use 名前を付けて保存 to write a second owned TEMP copy.
7. Create a second Copilot ZIP and confirm it exists.

- [ ] **Step 5: Handle any GUI defect with a separate RED/GREEN wave**

If either flow fails, stop the GUI run, add the smallest automated regression test reproducing the failure, run it to confirm RED for the observed reason, implement only the necessary fix, rerun the focused test to GREEN, then rerun Task 3 Steps 1 through 4. Commit such a fix separately:

~~~powershell
git add -- tests/sample-projects.test.ts
git diff --name-only
git diff --cached --check
git commit -m "fix: keep full sample projects demo-ready"
~~~

Before the commit, stage each production path printed by git diff --name-only individually and verify git diff --cached contains only the regression test and the observed fix. Do not create a fix commit when no defect is found.

- [ ] **Step 6: Clean up only owned GUI resources**

Close the recorded Electron process normally. If it remains, verify PID, executable path, and start time still match before stopping it. Remove only the unique evidenceRoot created in Step 2. Confirm no Electron child process with that user-data-dir remains and no project, ZIP, profile, screenshot, or log was written into the repository.

- [ ] **Step 7: Perform the final repository review**

Run:

~~~powershell
$executionBase = git merge-base 207a4ad HEAD
git diff --stat "$executionBase..HEAD"
git diff --check "$executionBase..HEAD"
git status -sb
git log --oneline "$executionBase..HEAD"
~~~

Review the complete diff against every section of the approved design. Confirm:

- two project files and no .clmcheck or result.json;
- production ProjectStore generation and opening;
- fixed IDs and timestamps;
- no persisted token or absolute path;
- four references, one role, five items, nine conditions, nine types, four scopes;
- zero preflight issues;
- projectPath catalog registration and files=10;
- byte-for-byte regeneration check in local verification and CI;
- Markdown and Word quick-start plus retained detailed instructions;
- clean tracked tree.

Do not push, merge, or create a pull request unless the user asks for remote publication.
