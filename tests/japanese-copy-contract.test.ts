import { describe, expect, it } from 'vitest';
import {
  actions,
  messages,
  statuses,
  terminology
} from '../src/shared/presentation/ja/index.js';

describe('Japanese presentation copy contract', () => {
  it('uses the approved Japanese terminology and actions', () => {
    expect(terminology).toMatchObject({
      project: 'プロジェクト',
      checklist: 'チェックリスト',
      referenceDocument: '参考資料',
      targetDocument: '主対象文書',
      generationSettings: '文書生成設定',
      preflight: '事前検査',
      documentTitle: '文書タイトル',
      intendedAudience: '想定読者',
      documentPurpose: '文書の目的',
      documentLanguage: '文書の言語',
      outputFormat: '生成するファイル形式',
      generationInstructions: '文書生成指示',
      projectDefaultRepairPolicy: 'プロジェクトの既定修正方針',
      referencePriority: '同一権威レベル内の優先順位'
    });

    expect(actions).toMatchObject({
      createExistingProject: '既存文書の検証を開始',
      createGenerationProject: '文書生成と検証を開始',
      openProject: 'プロジェクトを開く',
      saveOverwrite: '上書き保存',
      saveAs: '名前を付けて保存',
      selectTargetDocument: '主対象文書を選択',
      runPreflight: '事前検査を実行',
      createCopilotPackage: 'Copilot用ZIPを作成',
      openExportLocation: '生成したZIPの保存場所を開く',
      showDetails: '詳細を表示',
      hideDetails: '詳細を閉じる'
    });
  });

  it('uses approved status and empty-state wording', () => {
    expect(statuses).toMatchObject({
      saved: '保存済み',
      unsaved: '未保存の変更あり',
      processing: '処理中',
      existingDocumentMode: '既存文書を検証',
      documentGenerationMode: '文書を生成して検証',
      error: 'エラー',
      warning: '警告'
    });

    expect(messages).toMatchObject({
      initialProjectPrompt: '新しいプロジェクトを作成するか、既存のプロジェクトを開いてください。',
      targetNotSelected: '主対象文書が選択されていません。',
      referencesEmpty: '参考資料は登録されていません。',
      checklistItemsEmpty: 'チェック項目が登録されていません。',
      generationMissing: '文書生成設定がありません。',
      preflightNotRun: '事前検査はまだ実行されていません。',
      projectNotOpen: 'プロジェクトが開かれていません。',
      processing: '処理しています…'
    });
  });

  it('does not expose English decorative headings', () => {
    const publicCopy = JSON.stringify({ terminology, actions, statuses, messages });
    for (const forbidden of [
      'PROJECT',
      'PREFLIGHT',
      'OVERVIEW',
      'REFERENCES',
      'CHECKLIST',
      'LOCAL DOCUMENT VALIDATION PACKAGE BUILDER'
    ]) {
      expect(publicCopy).not.toContain(forbidden);
    }
  });
});
