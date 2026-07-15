import type { ValidationIssue } from './model.js';

export const GENERIC_USER_MESSAGE = '処理に失敗しました。再度お試しください。';
export const IPC_USER_ERROR_BRAND = 'checklistmaker.user-facing-error.v1' as const;
export const RENDERER_USER_ERROR_NAME_PREFIX = 'CheckListMakerUserFacingError:' as const;

const PROJECT_SAVE_VALIDATION_MESSAGES = {
  PROJECT_NAME_REQUIRED: '保存できません: プロジェクト名が空です。',
  TARGET_REQUIRED: '保存できません: 主対象文書がありません。',
  GENERATION_REQUIRED: '保存できません: 文書生成設定がありません。',
  GENERATION_TITLE_REQUIRED: '保存できません: 生成文書の題名が空です。',
  GENERATION_INSTRUCTIONS_REQUIRED: '保存できません: 文書生成指示が空です。',
  CONDITION_ID_INVALID: '保存できません: 条件IDの形式が不正です。',
  SCOPE_HEADING_REQUIRED: '保存できません: 章・見出しの指定が空です。',
  SCOPE_TABLE_REQUIRED: '保存できません: 対象表の説明が空です。',
  SCOPE_LOCATOR_REQUIRED: '保存できません: 自然言語による対象範囲が空です。',
  SEMANTIC_INSTRUCTION_REQUIRED: '保存できません: 意味判定の内容が空です。',
  TEXT_VALUES_REQUIRED: '保存できません: 語句が指定されていません。',
  NUMBER_SUBJECT_REQUIRED: '保存できません: 確認する数値の名称が空です。',
  NUMBER_RANGE_INVALID: '保存できません: 数値範囲が不正です。',
  NUMBER_VALUE_REQUIRED: '保存できません: 比較値がありません。',
  COUNT_RANGE_INVALID: '保存できません: 件数・文字数の範囲が不正です。',
  COUNT_VALUE_REQUIRED: '保存できません: 件数・文字数の比較値がありません。',
  DATE_SUBJECT_REQUIRED: '保存できません: 確認する日付の名称が空です。',
  DATE_RANGE_INVALID: '保存できません: 日付範囲が不正です。',
  DATE_VALUE_REQUIRED: '保存できません: 基準日がありません。',
  PATTERN_REQUIRED: '保存できません: 書式パターンが空です。',
  PATTERN_INVALID: '保存できません: 正規表現を解釈できません。',
  ONE_OF_VALUES_REQUIRED: '保存できません: 選択肢条件が未設定です。',
  CONSISTENCY_INSTRUCTION_REQUIRED: '保存できません: 整合性の確認内容が空です。',
  REFERENCE_ID_UNKNOWN: '保存できません: 存在しない参考資料IDが指定されています。',
  REFERENCE_ID_DUPLICATE: '保存できません: 参考資料IDが重複しています。',
  REFERENCE_PRIORITY_INVALID: '保存できません: 参考資料の優先順位が不正です。',
  CHECK_ITEM_ID_INVALID: '保存できません: チェック項目IDの形式が不正です。',
  CHECK_ITEM_ID_DUPLICATE: '保存できません: チェック項目IDが重複しています。',
  CHECK_ITEM_TITLE_REQUIRED: '保存できません: チェック項目名が空です。',
  CONDITION_GROUP_EMPTY: '保存できません: チェック項目に条件がありません。',
  CONDITION_ID_DUPLICATE: '保存できません: 条件IDが重複しています。'
} as const satisfies Record<string, string>;

const PROJECT_INVALID_FALLBACK_MESSAGE = 'プロジェクトデータが不正です。';

export const SAFE_USER_MESSAGES = {
  INVALID_ARGUMENT: ['入力データが不正です。'],
  OUTPUT_NOT_ALLOWED: ['この場所を開く権限がありません。'],
  WINDOW_UNAVAILABLE: [GENERIC_USER_MESSAGE],
  PROJECT_REQUIRED: ['プロジェクトを新規作成するか開いてください。'],
  PROJECT_OPEN_FAILED: ['プロジェクトを開けませんでした。ファイルが破損しているか、対応していない形式です。'],
  PROJECT_DOCUMENT_MISMATCH: ['選択文書が現在のプロジェクトと一致しません。文書を選択し直してください。'],
  PROJECT_MISMATCH: ['現在のプロジェクトと更新内容が一致しません。'],
  PROJECT_INVALID: [
    PROJECT_INVALID_FALLBACK_MESSAGE,
    ...Object.values(PROJECT_SAVE_VALIDATION_MESSAGES)
  ],
  PROJECT_SAVE_FAILED: ['プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'],
  PROJECT_DIRTY: ['プロジェクトを保存してからパッケージを作成してください。'],
  PACKAGE_EXPORT_FAILED: ['パッケージを作成できませんでした。保存先とアクセス権を確認してください。'],
  DOCUMENT_REGISTER_FAILED: [
    '文書を登録できませんでした。ファイルを確認してください。',
    '参考資料を登録できませんでした。ファイルを確認してください。'
  ],
  TEMPLATE_SAVE_FAILED: ['テンプレートを保存できませんでした。保存先とアクセス権を確認してください。'],
  TEMPLATE_OPEN_FAILED: ['テンプレートを開けませんでした。ファイルが破損しているか、対応していない形式です。']
} as const satisfies Record<string, readonly string[]>;

export const isSafeUserMessage = (code: string, message: string): boolean => {
  const messages = SAFE_USER_MESSAGES[code as keyof typeof SAFE_USER_MESSAGES];
  return messages?.some((candidate) => candidate === message) === true;
};

export type IpcError =
  | { brand: typeof IPC_USER_ERROR_BRAND; code: string; message: string }
  | { code: 'INTERNAL_ERROR'; message: typeof GENERIC_USER_MESSAGE };
export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: IpcError };

export class UserFacingError extends Error {
  constructor(readonly code: string, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'UserFacingError';
  }
}

export const projectSaveValidationError = (
  issue: Pick<ValidationIssue, 'code' | 'message'>
): UserFacingError => {
  const message = PROJECT_SAVE_VALIDATION_MESSAGES[
    issue.code as keyof typeof PROJECT_SAVE_VALIDATION_MESSAGES
  ] ?? PROJECT_INVALID_FALLBACK_MESSAGE;
  return new UserFacingError('PROJECT_INVALID', message);
};

export const ipcSuccess = <T>(value: T): IpcResult<T> => ({ ok: true, value });

export const runIpcOperation = async <T>(
  operation: () => Promise<T> | T,
  reportUnexpected: (error: unknown) => void = () => undefined
): Promise<IpcResult<T>> => {
  try {
    return ipcSuccess(await operation());
  } catch (error) {
    if (error instanceof UserFacingError) {
      if (isSafeUserMessage(error.code, error.message)) {
        if (error.cause !== undefined) reportUnexpected(error.cause);
        return {
          ok: false,
          error: {
            brand: IPC_USER_ERROR_BRAND,
            code: error.code,
            message: error.message
          }
        };
      }
      reportUnexpected(error.cause ?? error);
      return { ok: false, error: { code: 'INTERNAL_ERROR', message: GENERIC_USER_MESSAGE } };
    }
    reportUnexpected(error);
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: GENERIC_USER_MESSAGE } };
  }
};
