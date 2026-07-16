import { describe, expect, it } from 'vitest';
import {
  packageSaveDialogOptions,
  projectOpenDialogOptions,
  projectSaveDialogOptions,
  referencesSelectDialogOptions,
  targetSelectDialogOptions,
  templateOpenDialogOptions,
  templateSaveDialogOptions
} from '../src/shared/presentation/ja/dialogs.js';

describe('Electron Japanese dialog copy', () => {
  it('builds exact project and package dialogs', () => {
    expect(projectOpenDialogOptions()).toMatchObject({
      title: 'プロジェクトを開く',
      filters: [{ name: 'CheckListMakerプロジェクト（.clmproj）', extensions: ['clmproj'] }]
    });
    expect(projectSaveDialogOptions('')).toMatchObject({
      title: 'プロジェクトに名前を付けて保存',
      defaultPath: '新しいプロジェクト.clmproj'
    });
    expect(packageSaveDialogOptions('')).toMatchObject({
      title: 'Copilot用ZIPの保存先を選択',
      defaultPath: '新しいプロジェクト-copilot-package.zip',
      filters: [{ name: 'ZIPファイル（.zip）', extensions: ['zip'] }]
    });
  });

  it('uses distinct titles for target and reference selection', () => {
    expect(targetSelectDialogOptions().title).toBe('主対象文書を選択');
    expect(referencesSelectDialogOptions().title).toBe('参考資料を選択');
  });

  it('builds exact template dialogs', () => {
    expect(templateOpenDialogOptions().title).toBe('チェックリストテンプレートを開く');
    expect(templateSaveDialogOptions('').defaultPath).toBe('新しいチェックリスト.clmcheck');
  });
});
