import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  session,
  shell,
  type IpcMainInvokeEvent
} from 'electron';
import { randomUUID } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC } from '../shared/ipc.js';
import {
  GENERIC_USER_PRESENTATION,
  UserFacingError,
  type UserFacingErrorPresentation
} from '../shared/ipc-result.js';
import { APPLICATION_VERSION } from '../shared/model.js';
import type { SelectedDocument } from '../shared/model.js';
import {
  packageSaveDialogOptions,
  projectOpenDialogOptions,
  projectSaveDialogOptions,
  referencesSelectDialogOptions,
  targetSelectDialogOptions,
  templateOpenDialogOptions,
  templateSaveDialogOptions,
  userFacingErrors
} from '../shared/presentation/ja/index.js';
import {
  CloseCoordinator,
  coordinateClose
} from './close-coordinator.js';
import { DocumentRegistry } from './document-registry.js';
import { wireWindowCloseGuard } from './electron-adapter.js';
import { registerMainIpcBindings } from './main-ipc-bindings.js';
import { ProjectSessionManager } from './project-session.js';
import { ProjectSessionController, type SessionControllerPorts } from './session-controller.js';
import {
  createSessionHandlers,
  type SessionHandlerDependencies
} from './session-handlers.js';
import {
  CLOSE_FLUSH_TIMEOUT_MESSAGE,
  decisionForDialogResponse,
  unsavedDialogOptions
} from './session-dialogs.js';
import { guardUnsavedSession } from './session-workflows.js';

const directory = fileURLToPath(new URL('.', import.meta.url));
const manager = new ProjectSessionManager();
const allowedOutputPaths = new Set<string>();
const closeCoordinators = new Map<number, CloseCoordinator>();
const CLOSE_FLUSH_TIMEOUT_MS = 5_000;

const presentationForNativeError = (
  error: UserFacingErrorPresentation | string
): UserFacingErrorPresentation => typeof error === 'string'
  ? {
      title: '操作を続行できませんでした。',
      message: error,
      dataSafety: '保存済みのファイルは変更されていません。',
      nextAction: '内容を確認して、もう一度操作してください。'
    }
  : error;

const showSafeError = async (
  owner: BrowserWindow,
  error: UserFacingErrorPresentation | string
): Promise<void> => {
  const presentation = presentationForNativeError(error);
  const detail = [presentation.dataSafety, presentation.nextAction]
    .filter((value): value is string => Boolean(value))
    .join('\n\n');
  await dialog.showMessageBox(owner, {
    type: 'error',
    title: presentation.title,
    message: presentation.message,
    ...(detail ? { detail } : {}),
    buttons: ['閉じる'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
};

const createOwnerBoundPorts = (owner: BrowserWindow): SessionControllerPorts => ({
  askUnsaved: async (projectName) => {
    const result = await dialog.showMessageBox(owner, unsavedDialogOptions(projectName));
    return decisionForDialogResponse(result.response);
  },
  pickProjectPath: async (defaultName) => {
    const result = await dialog.showSaveDialog(owner, projectSaveDialogOptions(defaultName));
    return result.canceled ? undefined : result.filePath;
  },
  showError: (presentation) => showSafeError(owner, presentation),
  reportUnexpected: (error) => console.error(error),
  pickOpenProject: async () => {
    const result = await dialog.showOpenDialog(owner, projectOpenDialogOptions());
    return result.canceled ? undefined : result.filePaths[0];
  },
  pickExportPath: async (defaultName) => {
    const result = await dialog.showSaveDialog(owner, packageSaveDialogOptions(defaultName));
    return result.canceled ? undefined : result.filePath;
  }
});

const selectOneDocument = async (
  owner: BrowserWindow,
  registry: DocumentRegistry,
  storedPath: string
): Promise<SelectedDocument | null> => {
  const result = await dialog.showOpenDialog(owner, targetSelectDialogOptions());
  const selected = result.filePaths[0];
  if (result.canceled || !selected) return null;
  return registry.registerPath(selected, `${storedPath}${extname(selected).toLowerCase()}`);
};

const selectManyDocuments = async (
  owner: BrowserWindow,
  registry: DocumentRegistry
): Promise<SelectedDocument[]> => {
  const result = await dialog.showOpenDialog(owner, referencesSelectDialogOptions());
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map((path) =>
    registry.registerPath(
      path,
      `references/PENDING-${randomUUID()}${extname(path).toLowerCase()}`
    )
  ));
};

const assertSender = (owner: BrowserWindow, senderId: number): void => {
  if (senderId !== owner.webContents.id) {
    throw new UserFacingError('INVALID_ARGUMENT', userFacingErrors.invalidArgument);
  }
};

const createHandlerDependencies = (owner: BrowserWindow): SessionHandlerDependencies => ({
  manager,
  controllerFor: (senderId) => {
    assertSender(owner, senderId);
    return new ProjectSessionController(manager, createOwnerBoundPorts(owner));
  },
  selectTarget: (senderId, registry) => {
    assertSender(owner, senderId);
    return selectOneDocument(owner, registry, 'target/TARGET');
  },
  selectReferences: (senderId, registry) => {
    assertSender(owner, senderId);
    return selectManyDocuments(owner, registry);
  },
  pickTemplateSavePath: async (senderId, defaultName) => {
    assertSender(owner, senderId);
    const result = await dialog.showSaveDialog(owner, templateSaveDialogOptions(defaultName));
    return result.canceled ? undefined : result.filePath;
  },
  pickTemplateOpenPath: async (senderId) => {
    assertSender(owner, senderId);
    const result = await dialog.showOpenDialog(owner, templateOpenDialogOptions());
    return result.canceled ? undefined : result.filePaths[0];
  },
  acknowledgeClose: (senderId, requestId) => {
    closeCoordinators.get(senderId)?.acknowledge(requestId);
  },
  measureOutput: async (path) => (await stat(path)).size,
  allowedOutputPaths
});

const registerIpc = (): void => {
  registerMainIpcBindings({
    removeHandler: (channel) => ipcMain.removeHandler(channel),
    installHandler: (
      channel,
      listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>
    ) => {
      ipcMain.handle(channel, listener);
    },
    resolveOwner: (sender) => BrowserWindow.fromWebContents(sender) ?? undefined,
    handlersFor: (owner) => createSessionHandlers(createHandlerDependencies(owner)),
    allowedOutputPaths,
    showItemInFolder: (path) => shell.showItemInFolder(path),
    versions: () => ({
      application: APPLICATION_VERSION,
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome
    }),
    reportUnexpected: (error) => console.error(error)
  });
};

const registerCloseGuard = (window: BrowserWindow): void => {
  const senderId = window.webContents.id;
  const coordinator = new CloseCoordinator(randomUUID);
  wireWindowCloseGuard({
    senderId,
    coordinator,
    coordinators: closeCoordinators,
    onClose: (listener) => {
      window.on('close', listener);
    },
    onClosed: (listener) => {
      window.on('closed', listener);
    },
    send: (channel, requestId) => {
      window.webContents.send(channel, requestId);
    },
    isDestroyed: () => window.isDestroyed(),
    close: () => window.close(),
    coordinate: coordinateClose,
    guardUnsaved: () => manager.runExclusive(() =>
      guardUnsavedSession(manager, createOwnerBoundPorts(window))
    ),
    showError: (message) => showSafeError(window, message),
    reportUnexpected: (error) => console.error(error),
    timeoutMs: CLOSE_FLUSH_TIMEOUT_MS,
    timeoutMessage: CLOSE_FLUSH_TIMEOUT_MESSAGE,
    genericMessage: GENERIC_USER_PRESENTATION.message
  });
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

  registerCloseGuard(window);
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
  console.error(error);
  dialog.showErrorBox(GENERIC_USER_PRESENTATION.title, GENERIC_USER_PRESENTATION.message);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
