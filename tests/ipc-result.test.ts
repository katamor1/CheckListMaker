import { describe, expect, it, vi } from 'vitest';
import {
  GENERIC_USER_MESSAGE,
  UserFacingError,
  ipcSuccess,
  runIpcOperation
} from '../src/shared/ipc-result.js';

describe('IPC result boundary', () => {
  it('returns successful values unchanged', async () => {
    await expect(runIpcOperation(async () => 42)).resolves.toEqual(ipcSuccess(42));
  });

  it('preserves only an explicitly user-facing error', async () => {
    const result = await runIpcOperation(async () => {
      throw new UserFacingError(
        'PROJECT_SAVE_FAILED',
        'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
      );
    });

    expect(result).toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'PROJECT_SAVE_FAILED',
        message: 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
      }
    });
  });

  it('genericizes even a UserFacingError when its code and message are not allowlisted', async () => {
    const reportUnexpected = vi.fn();
    const unsafe = new UserFacingError(
      'PROJECT_SAVE_FAILED',
      'Cannot read properties of undefined at C:\\secret\\project.clmproj'
    );

    const result = await runIpcOperation(async () => {
      throw unsafe;
    }, reportUnexpected);

    expect(result).toEqual({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: GENERIC_USER_MESSAGE }
    });
    expect(JSON.stringify(result)).not.toContain('Cannot read properties');
    expect(reportUnexpected).toHaveBeenCalledWith(unsafe);
  });

  it('logs a hidden cause without returning it to the Renderer', async () => {
    const cause = new Error('C:\\private\\project.clmproj: access denied');
    const reportUnexpected = vi.fn();
    const result = await runIpcOperation(async () => {
      throw new UserFacingError(
        'PROJECT_SAVE_FAILED',
        'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。',
        cause
      );
    }, reportUnexpected);

    expect(result).toEqual({
      ok: false,
      error: {
        brand: 'checklistmaker.user-facing-error.v1',
        code: 'PROJECT_SAVE_FAILED',
        message: 'プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'
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
      error: { code: 'INTERNAL_ERROR', message: GENERIC_USER_MESSAGE }
    });
    expect(JSON.stringify(result)).not.toContain('secret stack detail');
    expect(reportUnexpected).toHaveBeenCalledOnce();
  });

});
