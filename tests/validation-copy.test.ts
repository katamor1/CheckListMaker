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
