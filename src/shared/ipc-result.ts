export const GENERIC_USER_MESSAGE = '処理に失敗しました。再度お試しください。';
export const IPC_USER_ERROR_BRAND = 'checklistmaker.user-facing-error.v1' as const;
export const RENDERER_USER_ERROR_NAME_PREFIX = 'CheckListMakerUserFacingError:' as const;

export const SAFE_USER_MESSAGES = {
  INVALID_ARGUMENT: ['入力データが不正です。'],
  OUTPUT_NOT_ALLOWED: ['この場所を開く権限がありません。'],
  WINDOW_UNAVAILABLE: [GENERIC_USER_MESSAGE],
  PROJECT_REQUIRED: ['プロジェクトを新規作成するか開いてください。'],
  PROJECT_OPEN_FAILED: ['プロジェクトを開けませんでした。ファイルが破損しているか、対応していない形式です。'],
  PROJECT_DOCUMENT_MISMATCH: ['選択文書が現在のプロジェクトと一致しません。文書を選択し直してください。'],
  PROJECT_MISMATCH: ['現在のプロジェクトと更新内容が一致しません。'],
  PROJECT_INVALID: ['プロジェクトデータが不正です。'],
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
