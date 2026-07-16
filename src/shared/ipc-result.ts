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
    super(presentation.message, cause === undefined ? undefined : { cause });
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
