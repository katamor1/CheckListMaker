export const dialogs = Object.freeze({
  projectOpenTitle: 'プロジェクトを開く',
  projectSaveTitle: 'プロジェクトに名前を付けて保存',
  targetSelectTitle: '主対象文書を選択',
  referencesSelectTitle: '参考資料を選択',
  templateOpenTitle: 'チェックリストテンプレートを開く',
  templateSaveTitle: 'チェックリストテンプレートに名前を付けて保存',
  packageSaveTitle: 'Copilot用ZIPの保存先を選択',
  projectFilter: 'CheckListMakerプロジェクト（.clmproj）',
  templateFilter: 'チェックリストテンプレート（.clmcheck）',
  supportedDocumentFilter: '対応文書（MD、TXT、DOCX、PDF）',
  zipFilter: 'ZIPファイル（.zip）',
  defaultProjectName: '新しいプロジェクト',
  defaultChecklistName: '新しいチェックリスト'
} as const);

const preferredName = (value: string, fallback: string): string =>
  value.trim().length > 0 ? value.trim() : fallback;

export const projectOpenDialogOptions = () => ({
  title: dialogs.projectOpenTitle,
  properties: ['openFile'] as const,
  filters: [{ name: dialogs.projectFilter, extensions: ['clmproj'] }]
});

export const projectSaveDialogOptions = (projectName: string) => ({
  title: dialogs.projectSaveTitle,
  defaultPath: `${preferredName(projectName, dialogs.defaultProjectName)}.clmproj`,
  filters: [{ name: dialogs.projectFilter, extensions: ['clmproj'] }]
});

export const targetSelectDialogOptions = () => ({
  title: dialogs.targetSelectTitle,
  properties: ['openFile'] as const,
  filters: [{ name: dialogs.supportedDocumentFilter, extensions: ['md', 'txt', 'docx', 'pdf'] }]
});

export const referencesSelectDialogOptions = () => ({
  title: dialogs.referencesSelectTitle,
  properties: ['openFile', 'multiSelections'] as const,
  filters: [{ name: dialogs.supportedDocumentFilter, extensions: ['md', 'txt', 'docx', 'pdf'] }]
});

export const templateOpenDialogOptions = () => ({
  title: dialogs.templateOpenTitle,
  properties: ['openFile'] as const,
  filters: [{ name: dialogs.templateFilter, extensions: ['clmcheck'] }]
});

export const templateSaveDialogOptions = (checklistName: string) => ({
  title: dialogs.templateSaveTitle,
  defaultPath: `${preferredName(checklistName, dialogs.defaultChecklistName)}.clmcheck`,
  filters: [{ name: dialogs.templateFilter, extensions: ['clmcheck'] }]
});

export const packageSaveDialogOptions = (projectName: string) => ({
  title: dialogs.packageSaveTitle,
  defaultPath: `${preferredName(projectName, dialogs.defaultProjectName)}-copilot-package.zip`,
  filters: [{ name: dialogs.zipFilter, extensions: ['zip'] }]
});
