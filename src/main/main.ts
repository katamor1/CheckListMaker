import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat } from 'node:fs/promises';
import { createProject } from '../shared/defaults.js';
import { IPC } from '../shared/ipc.js';
import type { ChecklistTemplateDefinition, ProjectDefinition, ProjectMode, ProjectSummary, SelectedDocument } from '../shared/model.js';
import { APPLICATION_VERSION } from '../shared/model.js';
import { validateProject } from '../shared/validation.js';
import { DocumentRegistry } from './document-registry.js';
import { ProjectStore } from './project-store.js';
import { CopilotPackageGenerator } from './package-generator.js';

const directory = fileURLToPath(new URL('.', import.meta.url));
const registry = new DocumentRegistry();
const store = new ProjectStore(registry);
const packageGenerator = new CopilotPackageGenerator(registry);
let currentProjectPath: string | undefined;
let currentTemplate: ChecklistTemplateDefinition | undefined;
const allowedOutputPaths = new Set<string>();

const requireProject = (value: unknown): ProjectDefinition => {
  if (!value || typeof value !== 'object') throw new Error('プロジェクトデータが不正です。');
  return value as ProjectDefinition;
};

const createWindow = (): BrowserWindow => {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 940,
    minHeight: 640,
    show: false,
    title: 'CheckListMaker',
    webPreferences: {
      preload: join(directory, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true
    }
  });

  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => {
    const development = process.env['VITE_DEV_SERVER_URL'];
    const allowed = development ? target.startsWith(development) : target.startsWith('file:');
    if (!allowed) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());

  const development = process.env['VITE_DEV_SERVER_URL'];
  if (development) void window.loadURL(development);
  else void window.loadFile(join(directory, '../renderer/index.html'));
  return window;
};

const registerNetworkBlock = (): void => {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const development = process.env['VITE_DEV_SERVER_URL'];
    if (development && details.url.startsWith(development)) callback({ cancel: false });
    else if (details.url.startsWith('file:') || details.url.startsWith('devtools:')) callback({ cancel: false });
    else callback({ cancel: true });
  });
};

const fileFilters = [{ name: '対応文書', extensions: ['md', 'txt', 'docx', 'pdf'] }];

const selectOneDocument = async (storedPath: string): Promise<SelectedDocument | null> => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: fileFilters });
  const selected = result.filePaths[0];
  return result.canceled || !selected ? null : registry.registerPath(selected, `${storedPath}${extname(selected).toLowerCase()}`);
};

const selectManyDocuments = async (): Promise<SelectedDocument[]> => {
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], filters: fileFilters });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map((path) => registry.registerPath(path, `references/PENDING-${crypto.randomUUID()}${extname(path).toLowerCase()}`)));
};

const registerIpc = (): void => {
  for (const channel of Object.values(IPC)) ipcMain.removeHandler(channel);

  ipcMain.handle(IPC.newProject, (_event, mode: ProjectMode): ProjectSummary => {
    if (mode !== 'existing_document' && mode !== 'document_generation') throw new Error('作業モードが不正です。');
    registry.clear();
    currentProjectPath = undefined;
    currentTemplate = undefined;
    return { project: createProject(mode), dirty: true };
  });

  ipcMain.handle(IPC.openProject, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'CheckListMakerプロジェクト', extensions: ['clmproj'] }] });
    const path = result.filePaths[0];
    if (result.canceled || !path) return { canceled: true };
    registry.clear();
    const project = await store.openProject(path);
    currentProjectPath = path;
    currentTemplate = undefined;
    return { canceled: false, summary: { path, project, dirty: false } };
  });

  ipcMain.handle(IPC.saveProject, async (_event, rawProject: unknown, saveAs = false) => {
    const project = requireProject(rawProject);
    const errors = validateProject(project).filter((row) => row.severity === 'error');
    if (errors.length) throw new Error(`保存できません: ${errors[0]?.message ?? '入力を確認してください。'}`);
    let path = saveAs ? undefined : currentProjectPath;
    if (!path) {
      const result = await dialog.showSaveDialog({
        defaultPath: `${project.name || 'project'}.clmproj`,
        filters: [{ name: 'CheckListMakerプロジェクト', extensions: ['clmproj'] }]
      });
      if (result.canceled || !result.filePath) return { canceled: true };
      path = result.filePath;
    }
    const updated = { ...project, updatedAt: new Date().toISOString() };
    await store.saveProject(path, updated);
    currentProjectPath = path;
    return { canceled: false, path, project: updated };
  });

  ipcMain.handle(IPC.selectTarget, () => selectOneDocument('target/TARGET'));
  ipcMain.handle(IPC.selectReferences, () => selectManyDocuments());
  ipcMain.handle(IPC.validateProject, (_event, rawProject: unknown) => validateProject(requireProject(rawProject)));

  ipcMain.handle(IPC.exportPackage, async (_event, rawProject: unknown) => {
    const project = requireProject(rawProject);
    const errors = validateProject(project).filter((row) => row.severity === 'error');
    if (errors.length) throw new Error(`パッケージを作成できません: ${errors[0]?.message ?? '入力を確認してください。'}`);
    const result = await dialog.showSaveDialog({
      defaultPath: `${project.name || 'project'}-copilot-package.zip`,
      filters: [{ name: 'ZIPパッケージ', extensions: ['zip'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const generated = await packageGenerator.generate(result.filePath, project);
    const fileStat = await stat(result.filePath);
    allowedOutputPaths.add(result.filePath);
    return { canceled: false, path: result.filePath, packageId: generated.packageId, fileCount: generated.fileCount, sizeBytes: fileStat.size };
  });

  ipcMain.handle(IPC.saveTemplate, async (_event, rawProject: unknown) => {
    const project = requireProject(rawProject);
    const result = await dialog.showSaveDialog({
      defaultPath: `${project.checklist.name || 'checklist'}.clmcheck`,
      filters: [{ name: 'CheckListMakerテンプレート', extensions: ['clmcheck'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    currentTemplate = await store.saveTemplate(result.filePath, project, currentTemplate);
    return { canceled: false, path: result.filePath };
  });

  ipcMain.handle(IPC.openTemplate, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'CheckListMakerテンプレート', extensions: ['clmcheck'] }] });
    const path = result.filePaths[0];
    if (result.canceled || !path) return null;
    currentTemplate = await store.openTemplate(path);
    return currentTemplate;
  });

  ipcMain.handle(IPC.openFolder, async (_event, path: string) => {
    if (!allowedOutputPaths.has(path)) throw new Error('この場所を開く権限がありません。');
    shell.showItemInFolder(path);
  });

  ipcMain.handle(IPC.versions, () => ({
    application: APPLICATION_VERSION,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  }));
};

app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,OptimizationHintsFetching');
app.setAppUserModelId('jp.checklistmaker.desktop');

app.whenReady().then(() => {
  registerNetworkBlock();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((error: unknown) => {
  dialog.showErrorBox('CheckListMakerを起動できません', error instanceof Error ? error.message : String(error));
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
