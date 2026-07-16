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
