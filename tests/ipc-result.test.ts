import { describe, expect, it, vi } from 'vitest';
import {
  GENERIC_USER_PRESENTATION,
  UserFacingError,
  ipcSuccess,
  projectSaveValidationError,
  runIpcOperation
} from '../src/shared/ipc-result.js';
import { userFacingErrors } from '../src/shared/presentation/ja/index.js';

describe('IPC result boundary', () => {
  it('returns successful values unchanged', async () => {
    await expect(runIpcOperation(async () => 42)).resolves.toEqual(ipcSuccess(42));
  });

  it('preserves only an explicitly structured user-facing error', async () => {
    const result = await runIpcOperation(async () => {
      throw new UserFacingError('PROJECT_SAVE_FAILED', userFacingErrors.projectSaveFailed);
    });

    expect(result).toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'PROJECT_SAVE_FAILED',
        presentation: userFacingErrors.projectSaveFailed
      }
    });
  });

  it('genericizes a UserFacingError with an unknown code or malformed presentation', async () => {
    const reportUnexpected = vi.fn();
    const unsafe = new UserFacingError(
      'PRIVATE_ERROR',
      { title: '秘密', message: 'C:\\secret\\project.clmproj at stack' },
      undefined
    );

    const result = await runIpcOperation(async () => {
      throw unsafe;
    }, reportUnexpected);

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', presentation: GENERIC_USER_PRESENTATION }
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(reportUnexpected).toHaveBeenCalledWith(unsafe);
  });

  it('logs a hidden cause without returning it to the Renderer', async () => {
    const cause = new Error('C:\\private\\project.clmproj: access denied');
    const reportUnexpected = vi.fn();
    const result = await runIpcOperation(async () => {
      throw new UserFacingError(
        'PROJECT_SAVE_FAILED',
        userFacingErrors.projectSaveFailed,
        cause
      );
    }, reportUnexpected);

    expect(result).toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'PROJECT_SAVE_FAILED',
        presentation: userFacingErrors.projectSaveFailed
      }
    });
    expect(reportUnexpected).toHaveBeenCalledWith(cause);
    expect(JSON.stringify(result)).not.toContain('C:\\private');
  });

  it('hides unexpected errors and reports them only to Main logging', async () => {
    const reportUnexpected = vi.fn();
    const result = await runIpcOperation(async () => {
      throw new TypeError('secret stack detail');
    }, reportUnexpected);

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', presentation: GENERIC_USER_PRESENTATION }
    });
    expect(JSON.stringify(result)).not.toContain('secret stack detail');
    expect(reportUnexpected).toHaveBeenCalledOnce();
  });

  it('maps validation feedback into structured save guidance without leaking raw text', () => {
    const known = projectSaveValidationError({
      code: 'GENERATION_INSTRUCTIONS_REQUIRED',
      message: '文書生成指示が入力されていません。',
      remediation: '生成する文書に含める内容を入力してください。'
    });
    expect(known).toMatchObject({
      code: 'PROJECT_INVALID',
      presentation: {
        title: '文書生成指示が入力されていません。',
        message: '生成する文書に含める内容を入力してください。',
        nextAction: '入力内容を修正してから、もう一度操作してください。'
      }
    });

    const unknown = projectSaveValidationError({
      code: 'UNKNOWN',
      message: '入力内容を確認してください。',
      remediation: '設定を見直してください。'
    });
    expect(JSON.stringify(unknown.presentation)).not.toContain('private');
  });
});
