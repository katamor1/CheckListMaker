import { actions } from '../shared/presentation/ja/index.js';
import type { UnsavedDecision } from './session-workflows.js';

export const CLOSE_FLUSH_TIMEOUT_MESSAGE =
  '最新の編集内容を確認できないため、終了を中止しました。もう一度操作してください。';

export const unsavedDialogOptions = (projectName: string) => ({
  type: 'warning' as const,
  title: '未保存の変更があります',
  message: `${projectName}には未保存の変更があります。`,
  detail: '保存してから続行するか、変更を破棄するか選択してください。',
  buttons: ['保存して続行', '保存せずに続行', actions.cancel],
  defaultId: 2,
  cancelId: 2,
  noLink: true
});

export const decisionForDialogResponse = (response: number): UnsavedDecision =>
  response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel';
