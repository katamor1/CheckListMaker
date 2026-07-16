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

export const userFacingErrors = Object.freeze({
  invalidArgument: {
    title: '入力内容を確認できませんでした。',
    message: 'アプリが受け取った入力データが不正です。',
    nextAction: '操作をやり直してください。'
  },
  outputNotAllowed: {
    title: '保存場所を開けませんでした。',
    message: 'この操作で作成したファイルではないため、保存場所を開けません。',
    nextAction: 'Copilot用ZIPをもう一度作成してください。'
  },
  projectRequired: {
    title: 'プロジェクトが開かれていません。',
    message: 'この操作を行うにはプロジェクトが必要です。',
    nextAction: '新しいプロジェクトを作成するか、既存のプロジェクトを開いてください。'
  },
  projectOpenFailed: {
    title: 'プロジェクトを開けませんでした。',
    message: '選択したプロジェクトファイルを読み込めませんでした。',
    dataSafety: '元のプロジェクトファイルは変更されていません。',
    nextAction: 'ファイルが移動、削除、破損していないか、対応する.clmprojファイルか確認してください。'
  },
  projectSaveFailed: {
    title: 'プロジェクトを保存できませんでした。',
    message: '保存処理を完了できませんでした。',
    dataSafety: '元のプロジェクトファイルは変更されていません。',
    nextAction: '保存先への書き込み権限と、ファイルがほかのアプリで開かれていないか確認してください。'
  },
  targetRegisterFailed: {
    title: '主対象文書を登録できませんでした。',
    message: '選択した文書を読み込めませんでした。',
    dataSafety: '元の文書は変更されていません。',
    nextAction: 'ファイルが移動、削除、破損していないか確認してください。'
  },
  referencesRegisterFailed: {
    title: '参考資料を登録できませんでした。',
    message: '選択した参考資料を読み込めませんでした。',
    dataSafety: '元の参考資料は変更されていません。',
    nextAction: 'ファイルが移動、削除、破損していないか確認してください。'
  },
  packageExportFailed: {
    title: 'Copilot用ZIPを作成できませんでした。',
    message: 'パッケージの保存処理を完了できませんでした。',
    dataSafety: 'プロジェクトと登録済み文書は変更されていません。',
    nextAction: '事前検査の内容、保存先への書き込み権限、空き容量を確認してください。'
  },
  templateSaveFailed: {
    title: 'チェックリストテンプレートを保存できませんでした。',
    message: 'テンプレートの保存処理を完了できませんでした。',
    dataSafety: '元のテンプレートファイルは変更されていません。',
    nextAction: '保存先への書き込み権限と、ファイルがほかのアプリで開かれていないか確認してください。'
  },
  templateOpenFailed: {
    title: 'チェックリストテンプレートを開けませんでした。',
    message: '選択したテンプレートを読み込めませんでした。',
    dataSafety: 'テンプレートファイルは変更されていません。',
    nextAction: 'ファイルが破損していないか、対応する.clmcheckファイルか確認してください。'
  },
  projectDocumentMismatch: {
    title: '選択した文書を登録できませんでした。',
    message: '選択した文書が現在のプロジェクトと一致しません。',
    dataSafety: '元の文書は変更されていません。',
    nextAction: '主対象文書または参考資料を選択し直してください。'
  },
  projectMismatch: {
    title: '編集内容を反映できませんでした。',
    message: '現在のプロジェクトと更新内容が一致しません。',
    dataSafety: '保存済みのプロジェクトファイルは変更されていません。',
    nextAction: 'プロジェクトを開き直して、もう一度編集してください。'
  },
  projectDirty: {
    title: 'Copilot用ZIPを作成できません。',
    message: 'プロジェクトに未保存の変更があります。',
    nextAction: 'プロジェクトを上書き保存してから、もう一度作成してください。'
  }
} as const);

export const projectCreatedMessage = (modeLabel: string): string =>
  `${modeLabel}するプロジェクトを作成しました。`;

export const referencesRegisteredMessage = (count: number): string =>
  `${count}件の参考資料を登録しました。用途、権威レベル、優先順位を確認してください。`;

export const preflightIssueCountMessage = (count: number): string =>
  `事前検査が完了しました。${count}件の指摘があります。`;

export const packageCreatedMessage = (fileCount: number): string =>
  `Copilot用ZIPを作成しました。パッケージには${fileCount}ファイルが含まれています。`;
