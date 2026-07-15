export const PRELOAD_IPC = {
  newProject: 'project:new',
  openProject: 'project:open',
  updateProject: 'project:update-draft',
  saveProject: 'project:save',
  selectTarget: 'document:select-target',
  selectReferences: 'document:select-references',
  exportPackage: 'package:export',
  validateProject: 'project:validate',
  saveTemplate: 'template:save',
  openTemplate: 'template:open',
  openFolder: 'shell:show-item',
  versions: 'app:versions',
  flushBeforeClose: 'session:flush-before-close',
  closeReady: 'session:close-ready',
  closeCanceled: 'session:close-canceled'
} as const;

export const PRELOAD_USER_ERROR_BRAND = 'checklistmaker.user-facing-error.v1' as const;
export const PRELOAD_RENDERER_ERROR_BRAND = 'checklistmaker.renderer-user-error.v1' as const;
export const PRELOAD_SAFE_USER_MESSAGES = {
  INVALID_ARGUMENT: ['入力データが不正です。'],
  OUTPUT_NOT_ALLOWED: ['この場所を開く権限がありません。'],
  WINDOW_UNAVAILABLE: ['処理に失敗しました。再度お試しください。'],
  PROJECT_REQUIRED: ['プロジェクトを新規作成するか開いてください。'],
  PROJECT_OPEN_FAILED: ['プロジェクトを開けませんでした。ファイルが破損しているか、対応していない形式です。'],
  PROJECT_DOCUMENT_MISMATCH: ['選択文書が現在のプロジェクトと一致しません。文書を選択し直してください。'],
  PROJECT_MISMATCH: ['現在のプロジェクトと更新内容が一致しません。'],
  PROJECT_INVALID: [
    'プロジェクトデータが不正です。',
    '保存できません: プロジェクト名が空です。',
    '保存できません: 主対象文書がありません。',
    '保存できません: 文書生成設定がありません。',
    '保存できません: 生成文書の題名が空です。',
    '保存できません: 文書生成指示が空です。',
    '保存できません: 条件IDの形式が不正です。',
    '保存できません: 章・見出しの指定が空です。',
    '保存できません: 対象表の説明が空です。',
    '保存できません: 自然言語による対象範囲が空です。',
    '保存できません: 意味判定の内容が空です。',
    '保存できません: 語句が指定されていません。',
    '保存できません: 確認する数値の名称が空です。',
    '保存できません: 数値範囲が不正です。',
    '保存できません: 比較値がありません。',
    '保存できません: 件数・文字数の範囲が不正です。',
    '保存できません: 件数・文字数の比較値がありません。',
    '保存できません: 確認する日付の名称が空です。',
    '保存できません: 日付範囲が不正です。',
    '保存できません: 基準日がありません。',
    '保存できません: 書式パターンが空です。',
    '保存できません: 正規表現を解釈できません。',
    '保存できません: 選択肢条件が未設定です。',
    '保存できません: 整合性の確認内容が空です。',
    '保存できません: 存在しない参考資料IDが指定されています。',
    '保存できません: 参考資料IDが重複しています。',
    '保存できません: 参考資料の優先順位が不正です。',
    '保存できません: チェック項目IDの形式が不正です。',
    '保存できません: チェック項目IDが重複しています。',
    '保存できません: チェック項目名が空です。',
    '保存できません: チェック項目に条件がありません。',
    '保存できません: 条件IDが重複しています。'
  ],
  PROJECT_SAVE_FAILED: ['プロジェクトを保存できませんでした。保存先とアクセス権を確認してください。'],
  PROJECT_DIRTY: ['プロジェクトを保存してからパッケージを作成してください。'],
  PACKAGE_EXPORT_FAILED: ['パッケージを作成できませんでした。保存先とアクセス権を確認してください。'],
  DOCUMENT_REGISTER_FAILED: [
    '文書を登録できませんでした。ファイルを確認してください。',
    '参考資料を登録できませんでした。ファイルを確認してください。'
  ],
  TEMPLATE_SAVE_FAILED: ['テンプレートを保存できませんでした。保存先とアクセス権を確認してください。'],
  TEMPLATE_OPEN_FAILED: ['テンプレートを開けませんでした。ファイルが破損しているか、対応していない形式です。']
} as const satisfies Record<string, readonly string[]>;

type RuntimeIpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { brand?: unknown; code: string; message: string } };

export interface PreloadIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

const isSafeUserMessage = (code: string, message: string): boolean => {
  const messages = PRELOAD_SAFE_USER_MESSAGES[code as keyof typeof PRELOAD_SAFE_USER_MESSAGES];
  return messages?.some((candidate) => candidate === message) === true;
};

const trustedRendererEnvelope = (code: string, message: string) => ({
  brand: PRELOAD_RENDERER_ERROR_BRAND,
  code,
  message
});

const invokeSafely = async <T>(ipc: PreloadIpc, channel: string, ...args: unknown[]): Promise<T> => {
  let result: unknown;
  try {
    result = await ipc.invoke(channel, ...args);
  } catch {
    throw new Error('処理に失敗しました。再度お試しください。');
  }
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw new Error('処理に失敗しました。再度お試しください。');
  }
  const envelope = result as RuntimeIpcResult<T>;
  if (envelope.ok === true && 'value' in envelope) return envelope.value;
  if (
    envelope.ok === false &&
    envelope.error &&
    envelope.error.brand === PRELOAD_USER_ERROR_BRAND &&
    typeof envelope.error.code === 'string' &&
    typeof envelope.error.message === 'string' &&
    isSafeUserMessage(envelope.error.code, envelope.error.message)
  ) {
    throw trustedRendererEnvelope(envelope.error.code, envelope.error.message);
  }
  throw new Error('処理に失敗しました。再度お試しください。');
};

export const createBridge = (ipc: PreloadIpc) => ({
  newProject: (mode: 'existing_document' | 'document_generation') =>
    invokeSafely(ipc, PRELOAD_IPC.newProject, mode),
  openProject: () => invokeSafely(ipc, PRELOAD_IPC.openProject),
  updateProject: (project: unknown, revision: number) =>
    invokeSafely(ipc, PRELOAD_IPC.updateProject, project, revision),
  saveProject: (saveAs = false) => invokeSafely(ipc, PRELOAD_IPC.saveProject, saveAs),
  selectTarget: () => invokeSafely(ipc, PRELOAD_IPC.selectTarget),
  selectReferences: () => invokeSafely(ipc, PRELOAD_IPC.selectReferences),
  exportPackage: () => invokeSafely(ipc, PRELOAD_IPC.exportPackage),
  validateProject: () => invokeSafely(ipc, PRELOAD_IPC.validateProject),
  saveTemplate: () => invokeSafely(ipc, PRELOAD_IPC.saveTemplate),
  openTemplate: () => invokeSafely(ipc, PRELOAD_IPC.openTemplate),
  openFolder: (path: string) => invokeSafely(ipc, PRELOAD_IPC.openFolder, path),
  getVersions: () => invokeSafely(ipc, PRELOAD_IPC.versions),
  closeReady: (requestId: string) => invokeSafely(ipc, PRELOAD_IPC.closeReady, requestId),
  onFlushBeforeClose: (listener: (requestId: string) => void) => {
    const registered = (_event: unknown, requestId: unknown): void => {
      if (typeof requestId === 'string') listener(requestId);
    };
    ipc.on(PRELOAD_IPC.flushBeforeClose, registered);
    return () => ipc.removeListener(PRELOAD_IPC.flushBeforeClose, registered);
  },
  onCloseCanceled: (listener: (requestId: string) => void) => {
    const registered = (_event: unknown, requestId: unknown): void => {
      if (typeof requestId === 'string') listener(requestId);
    };
    ipc.on(PRELOAD_IPC.closeCanceled, registered);
    return () => ipc.removeListener(PRELOAD_IPC.closeCanceled, registered);
  }
});

if ((process as NodeJS.Process & { type?: string }).type === 'renderer') {
  const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');
  contextBridge.exposeInMainWorld('checklistMaker', createBridge({
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    on: (channel, listener) => { ipcRenderer.on(channel, listener); },
    removeListener: (channel, listener) => { ipcRenderer.removeListener(channel, listener); }
  }));
}
