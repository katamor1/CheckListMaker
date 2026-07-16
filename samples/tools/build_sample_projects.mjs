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
