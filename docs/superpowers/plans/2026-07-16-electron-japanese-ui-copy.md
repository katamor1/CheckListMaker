# Electron版 日本語UI文言 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Electron版CheckListMakerの利用者向け文言を、正確さを優先した専門的な日本語へ統一し、画面・ダイアログ・通知・事前検査・エラー表示を一貫した語彙で提供する。

**Architecture:** 日本語表示文言を`src/shared/presentation/ja/`へ集約し、React RendererとElectron Main Processの双方が同じ公開入口から参照する。事前検査コードは内部契約として維持し、通常画面では隠して詳細表示時だけ開示する。IPCエラーは生の例外文ではなく、見出し、説明、データ安全性、次の操作、詳細コードを持つ構造化情報としてMainからPreloadを経てRendererへ渡す。

**Tech Stack:** TypeScript 5.9、Electron 41、React 19、Vitest 3、Vite 7、Node.js 22、Windows 11 x64。

## Global Constraints

- 対象仕様は`docs/superpowers/specs/2026-07-16-electron-japanese-ui-copy-design.md`である。
- 表示言語は日本語のみとし、翻訳ライブラリや汎用i18n基盤を導入しない。
- 正確さを優先した専門的な日本語を使用する。
- `プロジェクト`、`テンプレート`、`チェックリスト`、`Copilot`、`ZIP`、`JSON`、`Python`、`DOCX`、`PDF`はそのまま使用する。
- 利用者向けの英語装飾見出しを残さない。
- ボタン、メニュー、リンクは短く具体的な操作名とし、句点を付けない。
- 通知、説明、警告、エラーは丁寧語で統一する。
- 事前検査コードは通常表示せず、詳細表示時だけ開示する。
- OS、Node.js、Electron、ZIP処理由来の生の例外文をRendererへ直接渡さない。
- JSONプロパティ名、内部列挙値、内部ID、エラーコードを変更しない。
- `.clmproj`、`.clmcheck`、Copilot用ZIPの形式と内容契約を変更しない。
- `00_READ_ME_FIRST.md`、`01_EXECUTION_PROMPT.md`、`02_CONTINUE_PROMPT.md`、Pythonバリデータ内の文言を変更しない。
- サンプル文書とサンプル期待結果の本文を変更しない。
- Rendererの`nodeIntegration: false`、`contextIsolation: true`、sandbox有効の境界を維持する。
- 実装はテスト駆動で行い、各タスクを独立コミットにする。

---

## File Map

```text
src/shared/presentation/ja/
├── terminology.ts          # 基本用語、入力項目名、選択肢名
├── actions.ts              # ボタン、メニュー、リンク
├── statuses.ts             # モード、保存状態、処理状態、重要度
├── messages.ts             # 通知、空状態、補足、利用者向けエラー本文
├── dialogs.ts              # Electronダイアログのタイトル、フィルター、既定名
├── validation-messages.ts  # 事前検査コードに対応する表示文言
└── index.ts                # MainとRenderer向けの唯一の公開入口

src/renderer/
├── PreflightIssueList.tsx      # コードを通常非表示にする事前検査一覧
└── UserFacingErrorNotice.tsx   # 構造化エラーの表示

tests/
├── japanese-copy-contract.test.ts
├── validation-copy.test.ts
├── structured-user-error.test.ts
├── renderer-japanese-copy.test.ts
├── preflight-issue-list.test.ts
├── editor-japanese-copy.test.ts
├── dialog-copy.test.ts
└── japanese-copy-boundary.test.ts

docs/testing/
└── electron-japanese-ui-copy-checklist.md
```

## Locked Public Interfaces

タスク完了後、次のインターフェース名を後続コードから利用する。

```typescript
export const terminology: Readonly<Record<string, string>>;
export const actions: Readonly<Record<string, string>>;
export const statuses: Readonly<Record<string, string>>;
export const messages: Readonly<Record<string, string | ((...args: never[]) => string)>>;
export const dialogs: Readonly<Record<string, unknown>>;

export interface ValidationPresentation {
  title: string;
  remediation: string;
}
export const validationMessages: Readonly<Record<string, ValidationPresentation>>;
export const presentationForValidationCode: (
  code: string,
  fallback: ValidationPresentation
) => ValidationPresentation;

export interface UserFacingErrorPresentation {
  title: string;
  message: string;
  dataSafety?: string;
  nextAction?: string;
}

export interface RendererUserFacingError {
  code: string;
  presentation: UserFacingErrorPresentation;
}
```

---

### Task 1: 日本語共通文言モジュールを追加する

**Files:**
- Create: `src/shared/presentation/ja/terminology.ts`
- Create: `src/shared/presentation/ja/actions.ts`
- Create: `src/shared/presentation/ja/statuses.ts`
- Create: `src/shared/presentation/ja/messages.ts`
- Create: `src/shared/presentation/ja/dialogs.ts`
- Create: `src/shared/presentation/ja/index.ts`
- Test: `tests/japanese-copy-contract.test.ts`

**Interfaces:**
- Produces: `terminology`, `actions`, `statuses`, `messages`, `dialogs` and their re-exports from `index.ts`.
- Consumes: none.

- [ ] **Step 1: Write the failing copy contract test**

Create `tests/japanese-copy-contract.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  actions,
  messages,
  statuses,
  terminology
} from '../src/shared/presentation/ja/index.js';

describe('Japanese presentation copy contract', () => {
  it('uses the approved Japanese terminology and actions', () => {
    expect(terminology).toMatchObject({
      project: 'プロジェクト',
      checklist: 'チェックリスト',
      referenceDocument: '参考資料',
      targetDocument: '主対象文書',
      generationSettings: '文書生成設定',
      preflight: '事前検査',
      documentTitle: '文書タイトル',
      intendedAudience: '想定読者',
      documentPurpose: '文書の目的',
      documentLanguage: '文書の言語',
      outputFormat: '生成するファイル形式',
      generationInstructions: '文書生成指示',
      projectDefaultRepairPolicy: 'プロジェクトの既定修正方針',
      referencePriority: '同一権威レベル内の優先順位'
    });

    expect(actions).toMatchObject({
      createExistingProject: '既存文書の検証を開始',
      createGenerationProject: '文書生成と検証を開始',
      openProject: 'プロジェクトを開く',
      saveOverwrite: '上書き保存',
      saveAs: '名前を付けて保存',
      selectTargetDocument: '主対象文書を選択',
      runPreflight: '事前検査を実行',
      createCopilotPackage: 'Copilot用ZIPを作成',
      openExportLocation: '生成したZIPの保存場所を開く',
      showDetails: '詳細を表示',
      hideDetails: '詳細を閉じる'
    });
  });

  it('uses approved status and empty-state wording', () => {
    expect(statuses).toMatchObject({
      saved: '保存済み',
      unsaved: '未保存の変更あり',
      processing: '処理中',
      existingDocumentMode: '既存文書を検証',
      documentGenerationMode: '文書を生成して検証',
      error: 'エラー',
      warning: '警告'
    });

    expect(messages).toMatchObject({
      initialProjectPrompt: '新しいプロジェクトを作成するか、既存のプロジェクトを開いてください。',
      targetNotSelected: '主対象文書が選択されていません。',
      referencesEmpty: '参考資料は登録されていません。',
      checklistItemsEmpty: 'チェック項目が登録されていません。',
      generationMissing: '文書生成設定がありません。',
      preflightNotRun: '事前検査はまだ実行されていません。',
      projectNotOpen: 'プロジェクトが開かれていません。',
      processing: '処理しています…'
    });
  });

  it('does not expose English decorative headings', () => {
    const publicCopy = JSON.stringify({ terminology, actions, statuses, messages });
    for (const forbidden of ['PROJECT', 'PREFLIGHT', 'OVERVIEW', 'REFERENCES', 'CHECKLIST', 'LOCAL DOCUMENT VALIDATION PACKAGE BUILDER']) {
      expect(publicCopy).not.toContain(forbidden);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm the module is absent**

```powershell
npx vitest run tests/japanese-copy-contract.test.ts --config vitest.config.ts
```

Expected: FAIL because `src/shared/presentation/ja/index.ts` does not exist.

- [ ] **Step 3: Implement the approved copy objects**

Create `src/shared/presentation/ja/terminology.ts`:

```typescript
export const terminology = Object.freeze({
  productDescriptor: '文書検証パッケージ作成ツール',
  project: 'プロジェクト',
  checklist: 'チェックリスト',
  referenceDocument: '参考資料',
  targetDocument: '主対象文書',
  generationSettings: '文書生成設定',
  preflight: '事前検査',
  overviewAndDocument: '概要・文書',
  versionInformation: 'バージョン情報',
  documentTitle: '文書タイトル',
  intendedAudience: '想定読者',
  documentPurpose: '文書の目的',
  documentLanguage: '文書の言語',
  outputFormat: '生成するファイル形式',
  generationInstructions: '文書生成指示',
  projectDefaultRepairPolicy: 'プロジェクトの既定修正方針',
  referencePriority: '同一権威レベル内の優先順位'
} as const);
```

Create `src/shared/presentation/ja/actions.ts`:

```typescript
export const actions = Object.freeze({
  createExistingProject: '既存文書の検証を開始',
  createGenerationProject: '文書生成と検証を開始',
  openProject: 'プロジェクトを開く',
  saveOverwrite: '上書き保存',
  saveAs: '名前を付けて保存',
  selectTargetDocument: '主対象文書を選択',
  addReferenceDocument: '参考資料を追加',
  addChecklistItem: 'チェック項目を追加',
  addCondition: '条件を追加',
  deleteItem: '項目を削除',
  deleteCondition: '条件を削除',
  deleteReference: '参考資料を削除',
  duplicate: '複製',
  runPreflight: '事前検査を実行',
  createCopilotPackage: 'Copilot用ZIPを作成',
  openExportLocation: '生成したZIPの保存場所を開く',
  showDetails: '詳細を表示',
  hideDetails: '詳細を閉じる',
  close: '閉じる',
  cancel: 'キャンセル'
} as const);
```

Create `src/shared/presentation/ja/statuses.ts`:

```typescript
import type { ProjectMode } from '../../model.js';

export const statuses = Object.freeze({
  saved: '保存済み',
  unsaved: '未保存の変更あり',
  processing: '処理中',
  existingDocumentMode: '既存文書を検証',
  documentGenerationMode: '文書を生成して検証',
  error: 'エラー',
  warning: '警告'
} as const);

export const projectModeLabel = (mode: ProjectMode): string =>
  mode === 'existing_document'
    ? statuses.existingDocumentMode
    : statuses.documentGenerationMode;
```

Create `src/shared/presentation/ja/messages.ts`:

```typescript
export const messages = Object.freeze({
  initialProjectPrompt: '新しいプロジェクトを作成するか、既存のプロジェクトを開いてください。',
  targetNotSelected: '主対象文書が選択されていません。',
  referencesEmpty: '参考資料は登録されていません。',
  checklistItemsEmpty: 'チェック項目が登録されていません。',
  generationMissing: '文書生成設定がありません。',
  preflightNotRun: '事前検査はまだ実行されていません。',
  preflightHelp: '「事前検査を実行」を選ぶと、保存やCopilot用ZIPの作成前に入力内容を確認できます。',
  projectNotOpen: 'プロジェクトが開かれていません。',
  processing: '処理しています…',
  projectOpened: 'プロジェクトを開きました。',
  projectSaved: 'プロジェクトを保存しました。',
  projectSavedAs: 'プロジェクトに名前を付けて保存しました。',
  targetRegistered: '主対象文書を登録しました。',
  preflightPassed: '事前検査に合格しました。',
  unexpectedTitle: '処理中に予期しない問題が発生しました。',
  unchangedFiles: '元のファイルは変更されていません。',
  restartAndRetry: 'アプリを再起動して、もう一度操作してください。'
} as const);

export const projectCreatedMessage = (modeLabel: string): string =>
  `${modeLabel}するプロジェクトを作成しました。`;

export const referencesRegisteredMessage = (count: number): string =>
  `${count}件の参考資料を登録しました。用途、権威レベル、優先順位を確認してください。`;

export const preflightIssueCountMessage = (count: number): string =>
  `事前検査が完了しました。${count}件の指摘があります。`;

export const packageCreatedMessage = (fileCount: number): string =>
  `Copilot用ZIPを作成しました。パッケージには${fileCount}ファイルが含まれています。`;
```

Create `src/shared/presentation/ja/dialogs.ts` with immutable data only; Task 6 will consume it:

```typescript
export const dialogs = Object.freeze({
  projectOpenTitle: 'プロジェクトを開く',
  projectSaveTitle: 'プロジェクトに名前を付けて保存',
  targetSelectTitle: '主対象文書を選択',
  referencesSelectTitle: '参考資料を選択',
  templateOpenTitle: 'チェックリストテンプレートを開く',
  templateSaveTitle: 'チェックリストテンプレートに名前を付けて保存',
  packageSaveTitle: 'Copilot用ZIPの保存先を選択',
  projectFilter: 'CheckListMakerプロジェクト（.clmproj）',
  templateFilter: 'チェックリストテンプレート（.clmcheck）',
  supportedDocumentFilter: '対応文書（MD、TXT、DOCX、PDF）',
  zipFilter: 'ZIPファイル（.zip）',
  defaultProjectName: '新しいプロジェクト',
  defaultChecklistName: '新しいチェックリスト'
} as const);
```

Create `src/shared/presentation/ja/index.ts`:

```typescript
export * from './actions.js';
export * from './dialogs.js';
export * from './messages.js';
export * from './statuses.js';
export * from './terminology.js';
```

- [ ] **Step 4: Run the focused test**

```powershell
npx vitest run tests/japanese-copy-contract.test.ts --config vitest.config.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/shared/presentation/ja tests/japanese-copy-contract.test.ts
git commit -m "feat: add Japanese presentation copy contract"
```

---

### Task 2: 事前検査文言をコード別レジストリへ移す

**Files:**
- Create: `src/shared/presentation/ja/validation-messages.ts`
- Modify: `src/shared/presentation/ja/index.ts`
- Modify: `src/shared/validation.ts`
- Test: `tests/validation-copy.test.ts`
- Test: existing `tests/validation-feedback.test.ts`

**Interfaces:**
- Consumes: `validationMessages` public registry.
- Produces: `presentationForValidationCode(code, fallback)`.
- Preserves: `ValidationIssue.code`, `severity`, `section`, `entityId`, `field` and issue ordering.

- [ ] **Step 1: Write failing validation copy tests**

Create `tests/validation-copy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import {
  presentationForValidationCode,
  validationMessages
} from '../src/shared/presentation/ja/index.js';
import { validateProject } from '../src/shared/validation.js';

describe('Japanese validation presentation', () => {
  it('maps stable validation codes to approved Japanese copy', () => {
    expect(validationMessages.TARGET_REQUIRED).toEqual({
      title: '主対象文書が選択されていません。',
      remediation: 'MD、TXT、DOCX、またはPDFの主対象文書を選択してください。'
    });
    expect(validationMessages.GENERATION_INSTRUCTIONS_REQUIRED).toEqual({
      title: '文書生成指示が入力されていません。',
      remediation: '生成する文書に含める内容、構成、文体、注意事項を入力してください。'
    });
    expect(validationMessages.REFERENCE_PRIORITY_INVALID).toEqual({
      title: '参考資料の優先順位が範囲外です。',
      remediation: '同一権威レベル内の優先順位を0から100の整数で指定してください。'
    });
  });

  it('uses the registry copy without changing stable issue metadata', () => {
    const issue = validateProject(createProject('existing_document'))[0];
    expect(issue).toMatchObject({
      code: 'TARGET_REQUIRED',
      severity: 'error',
      section: 'document',
      message: validationMessages.TARGET_REQUIRED.title,
      remediation: validationMessages.TARGET_REQUIRED.remediation
    });
  });

  it('returns the supplied fallback for unknown future codes', () => {
    const fallback = { title: '入力内容を確認してください。', remediation: '設定を見直してください。' };
    expect(presentationForValidationCode('FUTURE_CODE', fallback)).toEqual(fallback);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run tests/validation-copy.test.ts --config vitest.config.ts
```

Expected: FAIL because `validation-messages.ts` is absent.

- [ ] **Step 3: Create the complete validation message registry**

Create `src/shared/presentation/ja/validation-messages.ts` and define every code currently emitted by `src/shared/validation.ts`. Use this exact interface:

```typescript
export interface ValidationPresentation {
  title: string;
  remediation: string;
}

export const validationMessages = Object.freeze({
  PROJECT_NAME_REQUIRED: {
    title: 'プロジェクト名が入力されていません。',
    remediation: 'プロジェクト名を入力してください。'
  },
  TARGET_REQUIRED: {
    title: '主対象文書が選択されていません。',
    remediation: 'MD、TXT、DOCX、またはPDFの主対象文書を選択してください。'
  },
  GENERATION_REQUIRED: {
    title: '文書生成設定がありません。',
    remediation: '文書生成と検証を開始して、文書生成設定を入力してください。'
  },
  GENERATION_TITLE_REQUIRED: {
    title: '文書タイトルが入力されていません。',
    remediation: '生成する文書のタイトルを入力してください。'
  },
  GENERATION_INSTRUCTIONS_REQUIRED: {
    title: '文書生成指示が入力されていません。',
    remediation: '生成する文書に含める内容、構成、文体、注意事項を入力してください。'
  },
  PDF_AUTOFIX_WARNING: {
    title: 'PDFには自動修正を適用できません。',
    remediation: '既定修正方針を「修正案のみ」に変更するか、この警告を確認したうえで続行してください。'
  },
  REFERENCE_ID_DUPLICATE: {
    title: '参考資料IDが重複しています。',
    remediation: '重複している参考資料を削除し、追加し直してください。'
  },
  REFERENCE_PRIORITY_INVALID: {
    title: '参考資料の優先順位が範囲外です。',
    remediation: '同一権威レベル内の優先順位を0から100の整数で指定してください。'
  },
  REFERENCE_PRECEDENCE_TIE: {
    title: '同じ権威レベルと優先順位の参考資料があります。',
    remediation: '資料が矛盾した場合に判断できるよう、同一権威レベル内の優先順位を見直してください。'
  },
  CHECK_ITEM_ID_INVALID: {
    title: 'チェック項目IDの形式が不正です。',
    remediation: 'チェック項目を削除し、追加し直してください。'
  },
  CHECK_ITEM_ID_DUPLICATE: {
    title: 'チェック項目IDが重複しています。',
    remediation: '重複しているチェック項目を削除してください。'
  },
  CHECK_ITEM_TITLE_REQUIRED: {
    title: 'チェック項目名が入力されていません。',
    remediation: 'チェック項目名を入力してください。'
  },
  CONDITION_GROUP_EMPTY: {
    title: 'チェック項目に条件がありません。',
    remediation: 'チェック項目へ1件以上の条件を追加してください。'
  },
  REQUIRED_ITEM_NA_WARNING: {
    title: '必須項目で「対象外」を許可しています。',
    remediation: '必須項目として意図した設定か確認してください。'
  },
  CONDITION_ID_INVALID: {
    title: '条件IDの形式が不正です。',
    remediation: '条件を削除し、追加し直してください。'
  },
  CONDITION_ID_DUPLICATE: {
    title: '条件IDが重複しています。',
    remediation: '重複している条件を削除し、追加し直してください。'
  },
  SCOPE_HEADING_REQUIRED: {
    title: '評価対象の見出しが入力されていません。',
    remediation: '評価対象とする章または見出しを入力してください。'
  },
  SCOPE_TABLE_REQUIRED: {
    title: '評価対象の表が指定されていません。',
    remediation: '対象表を特定できる説明を入力してください。'
  },
  SCOPE_LOCATOR_REQUIRED: {
    title: '評価対象箇所の説明が入力されていません。',
    remediation: '評価対象箇所を自然言語で説明してください。'
  },
  SEMANTIC_INSTRUCTION_REQUIRED: {
    title: '意味判定の内容が入力されていません。',
    remediation: '文書について判断する内容を入力してください。'
  },
  TEXT_VALUES_REQUIRED: {
    title: '確認する語句が入力されていません。',
    remediation: '必須語句または禁止語句を1件以上入力してください。'
  },
  NUMBER_SUBJECT_REQUIRED: {
    title: '確認する数値の名称が入力されていません。',
    remediation: '予算、監視周期など、確認対象の数値名を入力してください。'
  },
  NUMBER_RANGE_INVALID: {
    title: '数値範囲が不正です。',
    remediation: '最小値が最大値以下になるよう修正してください。'
  },
  NUMBER_VALUE_REQUIRED: {
    title: '数値の比較値が入力されていません。',
    remediation: '比較に使用する数値を入力してください。'
  },
  COUNT_RANGE_INVALID: {
    title: '文字数または件数の範囲が不正です。',
    remediation: '最小値が最大値以下になるよう修正してください。'
  },
  COUNT_VALUE_REQUIRED: {
    title: '文字数または件数の比較値が入力されていません。',
    remediation: '比較に使用する値を入力してください。'
  },
  DATE_SUBJECT_REQUIRED: {
    title: '確認する日付の名称が入力されていません。',
    remediation: '提出期限、改訂日など、確認対象の日付名を入力してください。'
  },
  DATE_RANGE_INVALID: {
    title: '日付範囲が不正です。',
    remediation: '開始日が終了日以前になるよう修正してください。'
  },
  DATE_VALUE_REQUIRED: {
    title: '基準日が入力されていません。',
    remediation: '比較に使用する日付を入力してください。'
  },
  PATTERN_REQUIRED: {
    title: '書式パターンが入力されていません。',
    remediation: 'プリセットを選択するか、正規表現を入力してください。'
  },
  PATTERN_INVALID: {
    title: '正規表現を解釈できません。',
    remediation: '正規表現の構文を修正してください。'
  },
  ONE_OF_VALUES_REQUIRED: {
    title: '許可する選択肢が入力されていません。',
    remediation: '確認対象と、許可する値を1件以上入力してください。'
  },
  CONSISTENCY_INSTRUCTION_REQUIRED: {
    title: '参考資料との整合性を確認する内容が入力されていません。',
    remediation: '主対象文書と参考資料の何を照合するか入力してください。'
  },
  REFERENCE_ID_UNKNOWN: {
    title: '存在しない参考資料が条件に指定されています。',
    remediation: '登録済みの参考資料を選択してください。'
  }
} satisfies Record<string, ValidationPresentation>);

export const presentationForValidationCode = (
  code: string,
  fallback: ValidationPresentation
): ValidationPresentation => validationMessages[
  code as keyof typeof validationMessages
] ?? fallback;
```

- [ ] **Step 4: Replace inline validation copy with registry lookups**

In `src/shared/validation.ts`, keep the existing `issue(...)` helper signature and code paths, but replace literal `message` and `remediation` arguments with a helper:

```typescript
import { presentationForValidationCode } from './presentation/ja/index.js';

const issueForCode = (
  code: string,
  severity: ValidationIssue['severity'],
  section: ValidationIssue['section'],
  entityId?: string,
  field?: string
): ValidationIssue => {
  const presentation = presentationForValidationCode(code, {
    title: '入力内容を確認してください。',
    remediation: '設定を見直してください。'
  });
  return {
    code,
    severity,
    section,
    message: presentation.title,
    remediation: presentation.remediation,
    ...(entityId === undefined ? {} : { entityId }),
    ...(field === undefined ? {} : { field })
  };
};
```

Every branch must call `issueForCode` with the same code, severity, section, entity and field as before. Do not change validation logic or issue ordering.

Re-export the new module from `src/shared/presentation/ja/index.ts`.

- [ ] **Step 5: Run focused and existing feedback tests**

```powershell
npx vitest run tests/validation-copy.test.ts tests/validation-feedback.test.ts --config vitest.config.ts
```

Expected: PASS. If `validation-feedback.test.ts` asserts an old sentence, update only the expected Japanese display text; keep the error code and transport assertions unchanged until Task 3.

- [ ] **Step 6: Commit**

```powershell
git add src/shared/presentation/ja src/shared/validation.ts tests/validation-copy.test.ts tests/validation-feedback.test.ts
git commit -m "refactor: centralize Japanese validation copy"
```

---

### Task 3: IPCエラーを構造化された利用者向け情報へ変更する

**Files:**
- Modify: `src/shared/ipc-result.ts`
- Modify: `src/preload/preload.ts`
- Modify: `src/renderer/session-orchestrator.ts`
- Create: `src/renderer/UserFacingErrorNotice.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/structured-user-error.test.ts`
- Test: existing `tests/ipc-result.test.ts`
- Test: existing `tests/preload.test.ts`
- Test: existing `tests/session-orchestrator.test.ts`
- Test: existing `tests/validation-feedback.test.ts`

**Interfaces:**
- Produces: `UserFacingErrorPresentation`, branded IPC error with `presentation`, `RendererUserFacingError`.
- Preserves: stable error `code` strings and the rule that untrusted errors become a generic safe error.
- Removes: Preload-owned duplicate Japanese message whitelist.

- [ ] **Step 1: Write a failing structured-error contract test**

Create `tests/structured-user-error.test.ts`:

```typescript
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  UserFacingError,
  runIpcOperation
} from '../src/shared/ipc-result.js';
import {
  normalizeRendererError,
  safeRendererError
} from '../src/renderer/session-orchestrator.js';
import { UserFacingErrorNotice } from '../src/renderer/UserFacingErrorNotice.js';

const presentation = {
  title: 'プロジェクトを保存できませんでした。',
  message: '保存処理を完了できませんでした。',
  dataSafety: '元のプロジェクトファイルは変更されていません。',
  nextAction: '保存先への書き込み権限と、ファイルがほかのアプリで開かれていないか確認してください。'
};

describe('structured user-facing error', () => {
  it('transports approved structured information with the stable code', async () => {
    const result = await runIpcOperation(() => {
      throw new UserFacingError('PROJECT_SAVE_FAILED', presentation);
    });

    expect(result).toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'PROJECT_SAVE_FAILED',
        presentation
      }
    });
  });

  it('renders data safety and next action while hiding the code by default', () => {
    const normalized = normalizeRendererError({
      brand: 'checklistmaker.renderer-user-error.v1',
      code: 'PROJECT_SAVE_FAILED',
      presentation
    });
    const safe = safeRendererError(normalized);
    const html = renderToStaticMarkup(createElement(UserFacingErrorNotice, { error: safe }));

    expect(html).toContain(presentation.title);
    expect(html).toContain(presentation.dataSafety);
    expect(html).toContain(presentation.nextAction);
    expect(html).toContain('詳細を表示');
    expect(html.indexOf('PROJECT_SAVE_FAILED')).toBeGreaterThan(html.indexOf('<details'));
  });

  it('replaces untrusted payloads with the generic safe presentation', () => {
    const safe = safeRendererError(new Error('C:\\secret\\file.docx at stack'));
    expect(safe.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(safe.presentation)).not.toContain('secret');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run tests/structured-user-error.test.ts --config vitest.config.ts
```

Expected: FAIL because the structured interfaces and component are absent.

- [ ] **Step 3: Extend the shared IPC result contract**

In `src/shared/ipc-result.ts`, replace message-only errors with:

```typescript
export interface UserFacingErrorPresentation {
  title: string;
  message: string;
  dataSafety?: string;
  nextAction?: string;
}

export type IpcError =
  | {
      brand: typeof IPC_USER_ERROR_BRAND;
      code: string;
      presentation: UserFacingErrorPresentation;
    }
  | {
      code: 'INTERNAL_ERROR';
      presentation: UserFacingErrorPresentation;
    };

export class UserFacingError extends Error {
  constructor(
    readonly code: string,
    readonly presentation: UserFacingErrorPresentation,
    cause?: unknown
  ) {
    super(presentation.message, cause === undefined ? undefined : { cause });
    this.name = 'UserFacingError';
  }
}
```

Create one generic presentation from the approved copy:

```typescript
export const GENERIC_USER_PRESENTATION: UserFacingErrorPresentation = {
  title: messages.unexpectedTitle,
  message: '処理を完了できませんでした。',
  dataSafety: messages.unchangedFiles,
  nextAction: messages.restartAndRetry
};
```

`runIpcOperation` must serialize only `code` and `presentation`, never `error.message`, `error.stack`, `cause`, file paths, or raw OS messages.

- [ ] **Step 4: Make Preload validate structure, not Japanese sentences**

In `src/preload/preload.ts`:

1. Remove `PRELOAD_SAFE_USER_MESSAGES`.
2. Add a fixed `Set` of accepted error codes. Include every key currently present in `SAFE_USER_MESSAGES` plus `INTERNAL_ERROR`.
3. Validate that `presentation.title` and `presentation.message` are non-empty strings, and optional fields are strings when present.
4. Reject unknown codes, missing brand, unexpected fields, or strings longer than 2,000 characters.
5. Throw the trusted renderer envelope with `{ brand, code, presentation }`.
6. On invocation failure or malformed envelope, throw the generic renderer envelope, not a raw `Error` containing the IPC failure.

The trusted envelope must be:

```typescript
const trustedRendererEnvelope = (
  code: string,
  presentation: UserFacingErrorPresentation
) => ({
  brand: PRELOAD_RENDERER_ERROR_BRAND,
  code,
  presentation
});
```

- [ ] **Step 5: Normalize errors as structured data in Renderer**

In `src/renderer/session-orchestrator.ts`, export:

```typescript
export interface RendererUserFacingError {
  code: string;
  presentation: UserFacingErrorPresentation;
}

export const normalizeRendererError = (error: unknown): RendererUserFacingError | unknown => {
  // Accept only the renderer brand, an allowed code and a structurally valid presentation.
};

export const safeRendererError = (error: unknown): RendererUserFacingError => {
  // Return normalized approved data or INTERNAL_ERROR with GENERIC_USER_PRESENTATION.
};
```

Remove `safeRendererErrorMessage`. Update all tests and `App.tsx` callers to use structured data.

- [ ] **Step 6: Add the error display component**

Create `src/renderer/UserFacingErrorNotice.tsx`:

```tsx
import type { RendererUserFacingError } from './session-orchestrator.js';
import { actions } from '../shared/presentation/ja/index.js';

export const UserFacingErrorNotice = ({ error }: { error: RendererUserFacingError }) => (
  <section className="user-error" role="alert" aria-labelledby="user-error-title">
    <h2 id="user-error-title">{error.presentation.title}</h2>
    <p>{error.presentation.message}</p>
    {error.presentation.dataSafety ? <p>{error.presentation.dataSafety}</p> : null}
    {error.presentation.nextAction ? <p>{error.presentation.nextAction}</p> : null}
    <details>
      <summary>
        <span className="details-closed-label">{actions.showDetails}</span>
        <span className="details-open-label">{actions.hideDetails}</span>
      </summary>
      <dl>
        <div><dt>エラーコード</dt><dd><code>{error.code}</code></dd></div>
      </dl>
    </details>
  </section>
);
```

In `App.tsx`, maintain `userError: RendererUserFacingError | null` separately from ordinary success/status `notice`. Clear it when a new operation begins or succeeds. Display `UserFacingErrorNotice` above the footer status text.

Add CSS to hide `.details-open-label` while closed and `.details-closed-label` while open.

- [ ] **Step 7: Update current UserFacingError call sites to compile**

Run:

```powershell
rg -n "new UserFacingError|GENERIC_USER_MESSAGE|safeRendererErrorMessage" src tests
```

Update every listed call site to pass a `UserFacingErrorPresentation`. Use the current Japanese meaning temporarily; Task 6 will replace Main Process dialog and operation-specific copy with the final approved wording. Do not use the raw caught exception as display text.

- [ ] **Step 8: Run the transport and renderer tests**

```powershell
npx vitest run tests/structured-user-error.test.ts tests/ipc-result.test.ts tests/preload.test.ts tests/session-orchestrator.test.ts tests/validation-feedback.test.ts --config vitest.config.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add src/shared/ipc-result.ts src/preload/preload.ts src/renderer/session-orchestrator.ts src/renderer/UserFacingErrorNotice.tsx src/renderer/App.tsx src/renderer/styles.css tests
git commit -m "feat: transport structured Japanese user errors"
```

---

### Task 4: アプリ外枠と事前検査表示を日本語文言へ移行する

**Files:**
- Create: `src/renderer/PreflightIssueList.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/ProjectWorkspace.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer-japanese-copy.test.ts`
- Test: `tests/preflight-issue-list.test.ts`

**Interfaces:**
- Consumes: `terminology`, `actions`, `statuses`, `messages`, `projectModeLabel`.
- Produces: `PreflightIssueList` rendering `ValidationIssue[]` with collapsed technical detail.

- [ ] **Step 1: Write failing Renderer copy tests**

Create `tests/renderer-japanese-copy.test.ts`:

```typescript
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
```

Create `tests/preflight-issue-list.test.ts`:

```typescript
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PreflightIssueList } from '../src/renderer/PreflightIssueList.js';

const issue = {
  code: 'TARGET_REQUIRED',
  severity: 'error' as const,
  section: 'document' as const,
  field: 'target',
  message: '主対象文書が選択されていません。',
  remediation: 'MD、TXT、DOCX、またはPDFの主対象文書を選択してください。'
};

describe('PreflightIssueList', () => {
  it('puts the technical code and location inside collapsed details', () => {
    const html = renderToStaticMarkup(createElement(PreflightIssueList, { issues: [issue] }));
    const detailsStart = html.indexOf('<details');
    expect(detailsStart).toBeGreaterThan(0);
    expect(html.indexOf('TARGET_REQUIRED')).toBeGreaterThan(detailsStart);
    expect(html).toContain('詳細を表示');
    expect(html).toContain('詳細を閉じる');
    expect(html).toContain('対象画面');
    expect(html).toContain('主対象文書');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run tests/renderer-japanese-copy.test.ts tests/preflight-issue-list.test.ts --config vitest.config.ts
```

Expected: FAIL because the current JSX contains English headings, ambiguous actions and a visible error code.

- [ ] **Step 3: Implement `PreflightIssueList`**

Create a component that:

- Groups no data; preserves issue order from `validateProject`.
- Displays `message` and `remediation` as the primary content.
- Uses native `<details>` for each issue.
- Shows code, section label, entity ID and field only inside `<details>`.
- Maps sections exactly:

```typescript
const sectionLabels = {
  overview: 'プロジェクト',
  document: '主対象文書',
  references: '参考資料',
  checklist: 'チェックリスト',
  generation: '文書生成設定',
  package: 'Copilot用ZIP'
} as const;
```

- Uses `エラー` and `警告` from `statuses`.
- Does not render an empty-state message; `ProjectWorkspace` owns that state.

- [ ] **Step 4: Migrate `App.tsx`**

Replace inline shared strings with imports from `src/shared/presentation/ja/index.ts`:

- Eyebrow: `文書検証パッケージ作成ツール`.
- Version aria label: `バージョン情報`.
- New-project actions: approved action strings.
- Initial prompt, success notices, count messages and processing status: `messages` and helper functions.
- Export completion: `packageCreatedMessage`.
- Export link: `actions.openExportLocation`.
- Keep `CheckListMaker` product name and `App`/`Electron` version keys as technical names.

- [ ] **Step 5: Migrate `ProjectWorkspace.tsx`**

Make these exact changes:

```text
PROJECT                     → プロジェクト
OVERVIEW                    → 概要・文書
PREFLIGHT                   → 事前検査
未保存                      → 未保存の変更あり
既定修正方針                → プロジェクトの既定修正方針
未選択                      → 主対象文書が選択されていません。
文書を選択                  → 主対象文書を選択
保存                        → 上書き保存
事前検査                    → 事前検査を実行
エラー N / 警告 N          → エラー N件、警告 N件
```

Replace the inline issue list with `PreflightIssueList`. Before inspection, show both:

```text
事前検査はまだ実行されていません。
「事前検査を実行」を選ぶと、保存やCopilot用ZIPの作成前に入力内容を確認できます。
```

Use a new `preflightHasRun: boolean` prop rather than inferring from `issues.length`, because zero issues after a successful inspection is distinct from “not run”. Add the state in `App.tsx`, reset it on new/open/edit, and set it to `true` after validation finishes.

- [ ] **Step 6: Add detail-label CSS and responsive checks**

In `styles.css`:

```css
.details-open-label { display: none; }
details[open] .details-open-label { display: inline; }
details[open] .details-closed-label { display: none; }
.issue-details dl { margin: 0.75rem 0 0; }
.issue-details dd { margin: 0; overflow-wrap: anywhere; }
```

Ensure long Japanese buttons can wrap and remain at least 44 CSS pixels high.

- [ ] **Step 7: Run focused tests**

```powershell
npx vitest run tests/renderer-japanese-copy.test.ts tests/preflight-issue-list.test.ts --config vitest.config.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/renderer/App.tsx src/renderer/ProjectWorkspace.tsx src/renderer/PreflightIssueList.tsx src/renderer/styles.css tests/renderer-japanese-copy.test.ts tests/preflight-issue-list.test.ts
git commit -m "feat: standardize Japanese workspace and preflight copy"
```

---

### Task 5: 編集フォーム全体の用語と空状態を統一する

**Files:**
- Modify: `src/renderer/GenerationSettingsForm.tsx`
- Modify: `src/renderer/ReferenceEditor.tsx`
- Modify: `src/renderer/ChecklistEditor.tsx`
- Modify: `src/renderer/CheckItemEditor.tsx`
- Modify: `src/renderer/ConditionEditor.tsx`
- Modify: `src/renderer/TextConditionFields.tsx`
- Modify: `src/renderer/NumberConditionFields.tsx`
- Modify: `src/renderer/CountConditionFields.tsx`
- Modify: `src/renderer/DateConditionFields.tsx`
- Modify: `src/renderer/StructuredConditionFields.tsx`
- Modify: `src/renderer/ScopeEditor.tsx`
- Modify: `src/renderer/ReferenceRoleEditor.tsx`
- Modify: `src/renderer/checklist-editor-shared.ts`
- Modify: `src/renderer/condition-editor-options.ts`
- Test: `tests/editor-japanese-copy.test.ts`
- Test: existing `tests/generation-settings-form.test.ts`
- Test: existing `tests/reference-editor.test.ts`
- Test: existing `tests/checklist-editor-form.test.ts`

**Interfaces:**
- Consumes: shared copy exports.
- Preserves: input `name` attributes, model values, IDs, form behavior and condition/scope types.

- [ ] **Step 1: Write the failing editor copy audit**

Create `tests/editor-japanese-copy.test.ts` that renders `GenerationSettingsForm`, `ReferenceEditor` and `ChecklistEditor` using the same fixtures as existing tests. Assert at least these exact labels and exclusions:

```typescript
expect(generationHtml).toContain('文書の言語');
expect(generationHtml).toContain('生成するファイル形式');
expect(referenceHtml).toContain('同一権威レベル内の優先順位（0～100）');
expect(referenceHtml).toContain('参考資料は登録されていません。');
expect(checklistHtml).toContain('プロジェクトの既定修正方針');
expect(checklistHtml).toContain('チェック項目が登録されていません。');
expect(referenceHtml).not.toContain('REFERENCES');
expect(checklistHtml).not.toContain('CHECKLIST');
```

Also assert that the technical values in `<option value>` remain unchanged.

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run tests/editor-japanese-copy.test.ts --config vitest.config.ts
```

Expected: FAIL on current labels and English headings.

- [ ] **Step 3: Migrate generation and reference forms**

Use shared terminology and actions. Apply these exact display changes:

```text
言語                         → 文書の言語
生成形式                     → 生成するファイル形式
REFERENCES                   → 参考資料
参考資料を追加               → 参考資料を追加（unchanged, now from actions）
表示名                       → 参考資料名
用途                         → 参考資料の用途
優先順位（0～100）           → 同一権威レベル内の優先順位（0～100）
有効日（任意）               → 適用開始日（任意）
参考資料はまだありません…   → 参考資料は登録されていません。MD、TXT、DOCX、PDFを複数選択できます。
削除                         → 参考資料を削除
```

Authority option labels must be Japanese first with the internal value retained only as supporting text:

```text
拘束力あり（binding）
承認済み（approved）
作業中（working）
参考（reference）
```

- [ ] **Step 4: Migrate checklist and item forms**

Apply:

```text
CHECKLIST                            → チェックリスト
プロジェクト既定の修正方針          → プロジェクトの既定修正方針
チェック項目がありません…           → チェック項目が登録されていません。1件以上追加してください。
名称未入力                           → チェック項目名が入力されていません
項目名                               → チェック項目名
条件の結合                           → 条件の結合方法
修正方針                             → この項目の修正方針
実行時メモ（任意）                   → Copilotへの補足（任意）
条件がありません…                   → 条件が登録されていません。1件以上追加してください。
```

Keep `AND` and `OR` because they are technical terms already explained by Japanese text.

- [ ] **Step 5: Migrate condition and scope forms**

Apply consistent labels:

```text
条件タイプ                           → 条件の種類
判断内容                             → 判断してほしい内容
一致条件                             → 必須語句の満たし方
評価範囲                             → 評価対象範囲
範囲                                 → 範囲の種類
対象が見つからない場合               → 指定した範囲が見つからない場合
確認が必要にする                     → 確認が必要な状態にする
見出し                               → 対象の見出し
意味で一致                           → 意味が近い見出しを許可
期待する列名                         → 必要な列名
```

Keep field `name` attributes and enum values exactly unchanged.

Move reusable condition type, scope type, authority and repair policy labels into `terminology.ts` or `statuses.ts`; existing option modules must import the labels rather than define competing strings.

- [ ] **Step 6: Update accessibility labels and confirmations**

- Replace `aria-label` copy with the same nouns used by visible labels.
- Confirmation text must name the affected object and consequence.
- Use:

```text
この参考資料をプロジェクトから削除しますか？
このチェック項目と、項目に含まれる条件を削除しますか？
この条件を削除しますか？
```

Do not replace the browser `confirm` mechanism in this task; only standardize its copy.

- [ ] **Step 7: Run editor tests**

```powershell
npx vitest run tests/editor-japanese-copy.test.ts tests/generation-settings-form.test.ts tests/reference-editor.test.ts tests/checklist-editor-form.test.ts --config vitest.config.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/renderer src/shared/presentation/ja tests/editor-japanese-copy.test.ts tests/generation-settings-form.test.ts tests/reference-editor.test.ts tests/checklist-editor-form.test.ts
git commit -m "refactor: standardize Japanese editor terminology"
```

---

### Task 6: ElectronダイアログとMain Processエラーを統一する

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/session-dialogs.ts`
- Modify: `src/main/session-handlers.ts`
- Modify: `src/main/session-controller.ts`
- Modify: `src/main/main-ipc-bindings.ts`
- Modify: `src/shared/presentation/ja/dialogs.ts`
- Modify: `src/shared/presentation/ja/messages.ts`
- Test: `tests/dialog-copy.test.ts`
- Test: existing `tests/session-dialogs.test.ts`
- Test: existing `tests/session-handlers.test.ts`
- Test: existing `tests/session-controller.test.ts`
- Test: existing `tests/main-ipc-bindings.test.ts`
- Test: existing `tests/validation-feedback.test.ts`

**Interfaces:**
- Consumes: dialog copy and structured `UserFacingError`.
- Produces: pure functions for Electron dialog options, testable without opening native dialogs.

- [ ] **Step 1: Write failing dialog copy tests**

Create `tests/dialog-copy.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  projectOpenDialogOptions,
  projectSaveDialogOptions,
  targetSelectDialogOptions,
  referencesSelectDialogOptions,
  templateOpenDialogOptions,
  templateSaveDialogOptions,
  packageSaveDialogOptions
} from '../src/shared/presentation/ja/dialogs.js';

describe('Electron Japanese dialog copy', () => {
  it('builds exact project and package dialogs', () => {
    expect(projectOpenDialogOptions()).toMatchObject({
      title: 'プロジェクトを開く',
      filters: [{ name: 'CheckListMakerプロジェクト（.clmproj）', extensions: ['clmproj'] }]
    });
    expect(projectSaveDialogOptions('')).toMatchObject({
      title: 'プロジェクトに名前を付けて保存',
      defaultPath: '新しいプロジェクト.clmproj'
    });
    expect(packageSaveDialogOptions('')).toMatchObject({
      title: 'Copilot用ZIPの保存先を選択',
      defaultPath: '新しいプロジェクト-copilot-package.zip',
      filters: [{ name: 'ZIPファイル（.zip）', extensions: ['zip'] }]
    });
  });

  it('uses distinct titles for target and reference selection', () => {
    expect(targetSelectDialogOptions().title).toBe('主対象文書を選択');
    expect(referencesSelectDialogOptions().title).toBe('参考資料を選択');
  });

  it('builds exact template dialogs', () => {
    expect(templateOpenDialogOptions().title).toBe('チェックリストテンプレートを開く');
    expect(templateSaveDialogOptions('').defaultPath).toBe('新しいチェックリスト.clmcheck');
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```powershell
npx vitest run tests/dialog-copy.test.ts --config vitest.config.ts
```

Expected: FAIL because option builders do not exist.

- [ ] **Step 3: Implement pure dialog option builders**

Replace the data-only `dialogs` object with exported functions returning Electron-compatible plain objects without importing Electron types. Required functions:

```typescript
projectOpenDialogOptions()
projectSaveDialogOptions(projectName: string)
targetSelectDialogOptions()
referencesSelectDialogOptions()
templateOpenDialogOptions()
templateSaveDialogOptions(checklistName: string)
packageSaveDialogOptions(projectName: string)
```

Every open dialog includes `title`, `properties` and exact `filters`. Every save dialog includes `title`, exact Japanese fallback `defaultPath` and exact `filters`.

- [ ] **Step 4: Replace inline Main Process dialog copy**

In `src/main/main.ts`:

- Remove `fileFilters`.
- Use the pure option builders for every `showOpenDialog` and `showSaveDialog` call.
- Keep paths, extensions and cancel behavior unchanged.
- Continue treating a canceled dialog as a normal canceled result, not an error.

In `src/main/session-dialogs.ts`, source buttons and status nouns from the shared copy. Preserve `defaultId: 2` and `cancelId: 2`.

- [ ] **Step 5: Add approved structured operation errors**

Create operation-specific presentations in `messages.ts`. Use these exact patterns:

```typescript
export const userFacingErrors = Object.freeze({
  projectOpenFailed: {
    title: 'プロジェクトを開けませんでした。',
    message: '選択したプロジェクトファイルを読み込めませんでした。',
    dataSafety: '元のプロジェクトファイルは変更されていません。',
    nextAction: 'ファイルが移動、削除、破損していないか、対応する.clmprojファイルか確認してください。'
  },
  projectSaveFailed: {
    title: 'プロジェクトを保存できませんでした。',
    message: '保存処理を完了できませんでした。',
    dataSafety: '元のプロジェクトファイルは変更されていません。',
    nextAction: '保存先への書き込み権限と、ファイルがほかのアプリで開かれていないか確認してください。'
  },
  targetRegisterFailed: {
    title: '主対象文書を登録できませんでした。',
    message: '選択した文書を読み込めませんでした。',
    dataSafety: '元の文書は変更されていません。',
    nextAction: 'ファイルが移動、削除、破損していないか確認してください。'
  },
  referencesRegisterFailed: {
    title: '参考資料を登録できませんでした。',
    message: '選択した参考資料を読み込めませんでした。',
    dataSafety: '元の参考資料は変更されていません。',
    nextAction: 'ファイルが移動、削除、破損していないか確認してください。'
  },
  packageExportFailed: {
    title: 'Copilot用ZIPを作成できませんでした。',
    message: 'パッケージの保存処理を完了できませんでした。',
    dataSafety: 'プロジェクトと登録済み文書は変更されていません。',
    nextAction: '事前検査の内容、保存先への書き込み権限、空き容量を確認してください。'
  },
  templateSaveFailed: {
    title: 'チェックリストテンプレートを保存できませんでした。',
    message: 'テンプレートの保存処理を完了できませんでした。',
    dataSafety: '元のテンプレートファイルは変更されていません。',
    nextAction: '保存先への書き込み権限と、ファイルがほかのアプリで開かれていないか確認してください。'
  },
  templateOpenFailed: {
    title: 'チェックリストテンプレートを開けませんでした。',
    message: '選択したテンプレートを読み込めませんでした。',
    dataSafety: 'テンプレートファイルは変更されていません。',
    nextAction: 'ファイルが破損していないか、対応する.clmcheckファイルか確認してください。'
  }
} as const);
```

Update Main Process `UserFacingError` call sites to use these objects. `PROJECT_INVALID` must use the first `ValidationIssue` title and remediation in a structured presentation; do not prefix it with `保存できません:`.

- [ ] **Step 6: Verify raw exceptions cannot cross IPC**

Update existing tests to assert:

- Error code remains stable.
- Presentation has title, message and next action.
- Save/register/export failures contain data-safety text.
- Raw `ENOENT`, Windows absolute paths, stack traces and caught messages are absent.
- Canceled dialogs still return canceled results without an error envelope.

- [ ] **Step 7: Run Main/IPC tests**

```powershell
npx vitest run tests/dialog-copy.test.ts tests/session-dialogs.test.ts tests/session-handlers.test.ts tests/session-controller.test.ts tests/main-ipc-bindings.test.ts tests/validation-feedback.test.ts --config vitest.config.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add src/main src/shared/presentation/ja src/shared/ipc-result.ts tests/dialog-copy.test.ts tests/session-dialogs.test.ts tests/session-handlers.test.ts tests/session-controller.test.ts tests/main-ipc-bindings.test.ts tests/validation-feedback.test.ts
git commit -m "feat: standardize Japanese dialogs and operation errors"
```

---

### Task 7: 全体文言監査、互換性検証、Windows目視チェックを追加する

**Files:**
- Create: `tests/japanese-copy-boundary.test.ts`
- Create: `docs/testing/electron-japanese-ui-copy-checklist.md`
- Modify: `.github/workflows/electron-ci.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: all completed copy modules and UI changes.
- Proves: no forbidden English decorative copy, copy does not leak into persisted/package contracts, full automated gate passes.

- [ ] **Step 1: Write a failing source-boundary audit**

Create `tests/japanese-copy-boundary.test.ts`:

```typescript
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
      '>保存<',
      '>文書を選択<',
      '生成したZIPを表示'
    ]) {
      expect(source).not.toContain(forbidden);
    }
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
```

- [ ] **Step 2: Run and confirm failure before the final sweep**

```powershell
npx vitest run tests/japanese-copy-boundary.test.ts --config vitest.config.ts
```

Expected: FAIL if any old copy remains.

- [ ] **Step 3: Sweep all user-visible string literals**

Run:

```powershell
rg -n "PROJECT|PREFLIGHT|OVERVIEW|REFERENCES|CHECKLIST|未選択|処理中…|生成したZIPを表示|>保存<|>事前検査<|文書を選択" src/renderer src/main
```

For each result:

- Replace user-visible copy with an approved shared export.
- Keep internal identifiers, comments, tests and technical constants when they are not rendered.
- Do not change package-generator prompt strings or Python validator strings.
- Add a regression assertion for every newly found recurring copy pattern.

Run a second audit for raw error exposure:

```powershell
rg -n "error\.message|String\(error\)|console\.error|showErrorBox|showMessageBox" src/main src/preload src/renderer
```

`console.error` is allowed for local developer diagnostics. Any value sent to Renderer or native user dialog must be a generic or approved structured presentation.

- [ ] **Step 4: Update CI to run the complete gates**

Ensure `.github/workflows/electron-ci.yml` runs these distinct commands on Windows:

```powershell
npm run typecheck
npm test
npm run verify:samples
npm run build
```

Keep logs uploaded on failure. Do not package or publish the EXE in this copy-only task.

- [ ] **Step 5: Add the Windows manual checklist**

Create `docs/testing/electron-japanese-ui-copy-checklist.md` with unchecked rows for:

1. Home header and version area contain no English decorative heading.
2. New-project buttons use the approved operation names.
3. Existing-document mode shows explicit target empty state.
4. Generation mode labels match the approved terminology.
5. Reference, checklist, item, condition and scope editors use consistent nouns.
6. Preflight code is hidden before expanding details.
7. Details can be opened and closed using keyboard only.
8. Error presentation includes failure, data safety and next action.
9. Open/save/select dialogs show approved titles and filters.
10. 100%, 150% and 200% display scaling do not clip buttons, labels or error text.
11. Long Japanese error text scrolls without hiding actions.
12. `.clmproj`, `.clmcheck` and Copilot ZIP round-trip tests remain green.

Record tester, Windows build, commit SHA and date when the manual check is performed. Do not mark items complete without evidence.

- [ ] **Step 6: Update README development status**

Add a short section linking the copy specification and manual checklist. Do not claim the manual scaling gate is complete until the checklist contains actual evidence.

- [ ] **Step 7: Run the full automated gate**

```powershell
npm run typecheck
npm test
npm run verify:samples
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 8: Inspect contract-sensitive diffs**

```powershell
git diff --exit-code main...HEAD -- src/shared/model.ts src/main/archive.ts src/main/project-store.ts src/main/package-generator.ts samples
```

Expected: no diff. If a contract-sensitive file changed for an unrelated reason, revert it before completion.

- [ ] **Step 9: Commit**

```powershell
git add tests/japanese-copy-boundary.test.ts docs/testing/electron-japanese-ui-copy-checklist.md .github/workflows/electron-ci.yml README.md
git commit -m "test: verify Japanese UI copy and compatibility"
```

---

## Completion Gate

Run from the repository root on Windows 11 x64:

```powershell
npm install --no-audit --no-fund
npm run typecheck
npm test
npm run verify:samples
npm run build
```

Automated completion requires all commands to exit `0` and the following checks to be true:

```text
- English decorative headings are absent from user-visible UI.
- Common terminology, actions, statuses and recurring messages come from src/shared/presentation/ja.
- Preflight codes are rendered only inside collapsed details.
- Main Process sends only approved structured error presentations.
- Preload does not own or generate Japanese display sentences.
- JSON, project, template, archive and Copilot package contract files are unchanged.
- Sample catalog validation passes.
```

Manual completion additionally requires `docs/testing/electron-japanese-ui-copy-checklist.md` to contain evidence for Windows 11 keyboard operation and 100%、150%、200% display scaling. Until that evidence exists, the implementation may be merged as reviewed application copy, but must not be described as having completed the visual acceptance gate.
