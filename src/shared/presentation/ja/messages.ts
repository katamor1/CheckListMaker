export const messages = Object.freeze({
  initialProjectPrompt: '新しいプロジェクトを作成するか、既存のプロジェクトを開いてください。',
  targetNotSelected: '主対象文書が選択されていません。',
  referencesEmpty: '参考資料は登録されていません。',
  checklistItemsEmpty: 'チェック項目が登録されていません。',
  generationMissing: '文書生成設定がありません。',
  preflightNotRun: '事前検査はまだ実行されていません。',
  preflightHelp: '「事前検査を実行」を選ぶと、保存やCopilot用ZIPの作成前に入力内容を確認できます。',
  projectNotOpen: 'プロジェクトが開かれていません。',
  processing: '処理しています…',
  projectOpened: 'プロジェクトを開きました。',
  projectSaved: 'プロジェクトを保存しました。',
  projectSavedAs: 'プロジェクトに名前を付けて保存しました。',
  targetRegistered: '主対象文書を登録しました。',
  preflightPassed: '事前検査に合格しました。',
  unexpectedTitle: '処理中に予期しない問題が発生しました。',
  unchangedFiles: '元のファイルは変更されていません。',
  restartAndRetry: 'アプリを再起動して、もう一度操作してください。'
} as const);

export const projectCreatedMessage = (modeLabel: string): string =>
  `${modeLabel}するプロジェクトを作成しました。`;

export const referencesRegisteredMessage = (count: number): string =>
  `${count}件の参考資料を登録しました。用途、権威レベル、優先順位を確認してください。`;

export const preflightIssueCountMessage = (count: number): string =>
  `事前検査が完了しました。${count}件の指摘があります。`;

export const packageCreatedMessage = (fileCount: number): string =>
  `Copilot用ZIPを作成しました。パッケージには${fileCount}ファイルが含まれています。`;
