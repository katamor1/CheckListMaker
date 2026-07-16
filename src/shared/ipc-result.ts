import type { ValidationIssue } from './model.js';
import { messages } from './presentation/ja/index.js';

export const IPC_USER_ERROR_BRAND = 'checklistmaker.user-facing-error.v1' as const;
export const RENDERER_USER_ERROR_NAME_PREFIX = 'CheckListMakerUserFacingError:' as const;

export interface UserFacingErrorPresentation {
  title: string;
  message: string;
  dataSafety?: string;
  nextAction?: string;
}

export const GENERIC_USER_PRESENTATION: UserFacingErrorPresentation = Object.freeze({
  title: messages.unexpectedTitle,
  message: '処理を完了できませんでした。',
  dataSafety: messages.unchangedFiles,
  nextAction: messages.restartAndRetry
});

export const GENERIC_USER_MESSAGE = GENERIC_USER_PRESENTATION.message;

export const KNOWN_USER_ERROR_CODES: ReadonlySet<string> = new Set([
  'INVALID_ARGUMENT',
  'OUTPUT_NOT_ALLOWED',
  'WINDOW_UNAVAILABLE',
  'PROJECT_REQUIRED',
  'PROJECT_OPEN_FAILED',
  'PROJECT_DOCUMENT_MISMATCH',
  'PROJECT_MISMATCH',
  'PROJECT_INVALID',
  'PROJECT_SAVE_FAILED',
  'PROJECT_DIRTY',
  'PACKAGE_EXPORT_FAILED',
  'DOCUMENT_REGISTER_FAILED',
  'TEMPLATE_SAVE_FAILED',
  'TEMPLATE_OPEN_FAILED',
  'INTERNAL_ERROR'
]);

const validText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 2_000;

export const isUserFacingErrorPresentation = (
  value: unknown
): value is UserFacingErrorPresentation => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.some((key) => !['title', 'message', 'dataSafety', 'nextAction'].includes(key))) return false;
  if (!validText(candidate['title']) || !validText(candidate['message'])) return false;
  if (candidate['dataSafety'] !== undefined && !validText(candidate['dataSafety'])) return false;
  if (candidate['nextAction'] !== undefined && !validText(candidate['nextAction'])) return false;
  return true;
};

const internalErrorMessage = (
  code: string,
  presentation: UserFacingErrorPresentation
): string => {
  switch (code) {
    case 'INVALID_ARGUMENT': return '入力データが不正です。';
    case 'OUTPUT_NOT_ALLOWED': return 'この場所を開く権限がありません。';
    case 'WINDOW_UNAVAILABLE': return '処理に失敗しました。再度お試しください。';
    case 'PROJECT_REQUIRED': return 'プロジェクトを新規作成するか開いてください。';
    case 'PROJECT_OPEN_FAILED': return 'プロジェクトを開けませんでした。ファイルが破損しているか、対応していない形式です。';
    case 'PROJECT_DOCUMENT_MISMATCH': return '選択文書が現在のプロジェクトと一致しません。文書を選択し直してください。';
    case 'PROJECT_MISMATCH': return '現在のプロジェクトと更新内容が一致しません。';
    case 'PROJECT_INVALID': return 'プロジェクトデータが不正です。';
    case 'PROJECT_SAVE_FAILED': return 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。';
    case 'PROJECT_DIRTY': return 'プロジェクトを保存してからパッケージを作成してください。';
    case 'PACKAGE_EXPORT_FAILED': return 'パッケージを作成できませんでした。保存先とアクセス権を確認してください。';
    case 'DOCUMENT_REGISTER_FAILED':
      return presentation.title.startsWith('参考資料')
        ? '参考資料を登録できませんでした。ファイルを確認してください。'
        : '文書を登録できませんでした。ファイルを確認してください。';
    case 'TEMPLATE_SAVE_FAILED': return 'テンプレートを保存できませんでした。保存先とアクセス権を確認してください。';
    case 'TEMPLATE_OPEN_FAILED': return 'テンプレートを開けませんでした。ファイルが破損しているか、対応していない形式です。';
    default: return presentation.message;
  }
};

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

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: IpcError };

export class UserFacingError extends Error {
  constructor(
    readonly code: string,
    readonly presentation: UserFacingErrorPresentation,
    cause?: unknown
  ) {
    super(internalErrorMessage(code, presentation), cause === undefined ? undefined : { cause });
    this.name = 'UserFacingError';
  }
}

export const projectSaveValidationError = (
  issue: Pick<ValidationIssue, 'code' | 'message' | 'remediation'>
): UserFacingError => new UserFacingError('PROJECT_INVALID', {
  title: issue.message,
  message: issue.remediation,
  nextAction: '入力内容を修正してから、もう一度操作してください。'
});

export const ipcSuccess = <T>(value: T): IpcResult<T> => ({ ok: true, value });

export const runIpcOperation = async <T>(
  operation: () => Promise<T> | T,
  reportUnexpected: (error: unknown) => void = () => undefined
): Promise<IpcResult<T>> => {
  try {
    return ipcSuccess(await operation());
  } catch (error) {
    if (
      error instanceof UserFacingError &&
      KNOWN_USER_ERROR_CODES.has(error.code) &&
      isUserFacingErrorPresentation(error.presentation)
    ) {
      if (error.cause !== undefined) reportUnexpected(error.cause);
      return {
        ok: false,
        error: {
          brand: IPC_USER_ERROR_BRAND,
          code: error.code,
          presentation: error.presentation
        }
      };
    }
    reportUnexpected(error instanceof UserFacingError ? error.cause ?? error : error);
    return {
      ok: false,
      error: {
        code: 'INTERNAL_ERROR',
        presentation: GENERIC_USER_PRESENTATION
      }
    };
  }
};
