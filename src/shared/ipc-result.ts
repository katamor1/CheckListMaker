export const GENERIC_USER_MESSAGE = '処理に失敗しました。再度お試しください。';

export type IpcError = { code: string; message: string };
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
      if (error.cause !== undefined) reportUnexpected(error.cause);
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    reportUnexpected(error);
    return { ok: false, error: { code: 'INTERNAL_ERROR', message: GENERIC_USER_MESSAGE } };
  }
};
