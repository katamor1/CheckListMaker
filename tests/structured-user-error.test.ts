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
