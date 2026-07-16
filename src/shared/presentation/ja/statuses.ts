import type { ProjectMode } from '../../model.js';

export const statuses = Object.freeze({
  saved: '保存済み',
  unsaved: '未保存の変更あり',
  processing: '処理中',
  existingDocumentMode: '既存文書を検証',
  documentGenerationMode: '文書を生成して検証',
  error: 'エラー',
  warning: '警告'
} as const);

export const projectModeLabel = (mode: ProjectMode): string =>
  mode === 'existing_document'
    ? statuses.existingDocumentMode
    : statuses.documentGenerationMode;
