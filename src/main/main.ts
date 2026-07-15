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
import { GENERIC_USER_MESSAGE, runIpcOperation, UserFacingError } from '../shared/ipc-result.js';
import { APPLICATION_VERSION } from '../shared/model.js';
import type { SelectedDocument } from '../shared/model.js';
import {
  CloseCoordinator,
  coordinateClose
} from './close-coordinator.js';
import { DocumentRegistry } from './document-registry.js';
import {
  registerElectronIpc,
  wireWindowCloseGuard
} from './electron-adapter.js';
import { ProjectSessionManager } from './project-session.js';
import { ProjectSessionController, type SessionControllerPorts } from './session-controller.js';
import {
  createSessionHandlers,
  SESSION_INVOKE_CHANNELS,
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

const fileFilters = [{ name: '対応文書', extensions: ['md', 'txt', 'docx', 'pdf'] }];

const showSafeError = async (owner: BrowserWindow, message: string): Promise<void> => {
  await dialog.showMessageBox(owner, {
    type: 'error',
    title: 'CheckListMaker',
    message,
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
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: `${defaultName || 'project'}.clmproj`,
      filters: [{ name: 'CheckListMakerプロジェクト', extensions: ['clmproj'] }]
    });
    return result.canceled ? undefined : result.filePath;
  },
  showError: (message) => showSafeError(owner, message),
  reportUnexpected: (error) => console.error(error),
  pickOpenProject: async () => {
    const result = await dialog.showOpenDialog(owner, {
      properties: ['openFile'],
      filters: [{ name: 'CheckListMakerプロジェクト', extensions: ['clmproj'] }]
    });
    return result.canceled ? undefined : result.filePaths[0];
  },
  pickExportPath: async (defaultName) => {
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: `${defaultName || 'project'}-copilot-package.zip`,
      filters: [{ name: 'ZIPパッケージ', extensions: ['zip'] }]
    });
    return result.canceled ? undefined : result.filePath;
  }
});

const selectOneDocument = async (
  owner: BrowserWindow,
  registry: DocumentRegistry,
  storedPath: string
): Promise<SelectedDocument | null> => {
  const result = await dialog.showOpenDialog(owner, {
    properties: ['openFile'],
    filters: fileFilters
  });
  const selected = result.filePaths[0];
  if (result.canceled || !selected) return null;
  return registry.registerPath(selected, `${storedPath}${extname(selected).toLowerCase()}`);
};

const selectManyDocuments = async (
  owner: BrowserWindow,
  registry: DocumentRegistry
): Promise<SelectedDocument[]> => {
  const result = await dialog.showOpenDialog(owner, {
    properties: ['openFile', 'multiSelections'],
    filters: fileFilters
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map((path) =>
    registry.registerPath(
      path,
      `references/PENDING-${randomUUID()}${extname(path).toLowerCase()}`
    )
  ));
};

const createHandlerDependencies = (owner: BrowserWindow): SessionHandlerDependencies => ({
  manager,
  controllerFor: (senderId) => {
    if (senderId !== owner.webContents.id) {
      throw new UserFacingError('INVALID_ARGUMENT', '入力データが不正です。');
    }
    return new ProjectSessionController(manager, createOwnerBoundPorts(owner));
  },
  selectTarget: (senderId, registry) => {
    if (senderId !== owner.webContents.id) {
      throw new UserFacingError('INVALID_ARGUMENT', '入力データが不正です。');
    }
    return selectOneDocument(owner, registry, 'target/TARGET');
  },
  selectReferences: (senderId, registry) => {
    if (senderId !== owner.webContents.id) {
      throw new UserFacingError('INVALID_ARGUMENT', '入力データが不正です。');
    }
    return selectManyDocuments(owner, registry);
  },
  pickTemplateSavePath: async (senderId, defaultName) => {
    if (senderId !== owner.webContents.id) {
      throw new UserFacingError('INVALID_ARGUMENT', '入力データが不正です。');
    }
    const result = await dialog.showSaveDialog(owner, {
      defaultPath: `${defaultName || 'checklist'}.clmcheck`,
      filters: [{ name: 'CheckListMakerテンプレート', extensions: ['clmcheck'] }]
    });
    return result.canceled ? undefined : result.filePath;
  },
  pickTemplateOpenPath: async (senderId) => {
    if (senderId !== owner.webContents.id) {
      throw new UserFacingError('INVALID_ARGUMENT', '入力データが不正です。');
    }
    const result = await dialog.showOpenDialog(owner, {
      properties: ['openFile'],
      filters: [{ name: 'CheckListMakerテンプレート', extensions: ['clmcheck'] }]
    });
    return result.canceled ? undefined : result.filePaths[0];
  },
  acknowledgeClose: (senderId, requestId) => {
    closeCoordinators.get(senderId)?.acknowledge(requestId);
  },
  measureOutput: async (path) => (await stat(path)).size,
  allowedOutputPaths
});

const registerIpc = (): void => {
  registerElectronIpc({
    allChannels: Object.values(IPC),
    sessionChannels: SESSION_INVOKE_CHANNELS,
    directHandlers: [
      {
        channel: IPC.openFolder,
        operation: async (_event: IpcMainInvokeEvent, rawPath: unknown) => {
          if (typeof rawPath !== 'string') {
            throw new UserFacingError('INVALID_ARGUMENT', '入力データが不正です。');
          }
          if (!allowedOutputPaths.has(rawPath)) {
            throw new UserFacingError('OUTPUT_NOT_ALLOWED', 'この場所を開く権限がありません。');
          }
          shell.showItemInFolder(rawPath);
        }
      },
      {
        channel: IPC.versions,
        operation: () => ({
          application: APPLICATION_VERSION,
          electron: process.versions.electron,
          node: process.versions.node,
          chrome: process.versions.chrome
        })
      }
    ],
    removeHandler: (channel) => ipcMain.removeHandler(channel),
    installHandler: (channel, listener) => {
      ipcMain.handle(channel, listener);
    },
    runSafely: (operation) => runIpcOperation(operation, (error) => console.error(error)),
    resolveOwner: (sender) => BrowserWindow.fromWebContents(sender) ?? undefined,
    handlersFor: (owner) => createSessionHandlers(createHandlerDependencies(owner)),
    ownerUnavailable: () => {
      throw new UserFacingError('WINDOW_UNAVAILABLE', GENERIC_USER_MESSAGE);
    }
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
    genericMessage: GENERIC_USER_MESSAGE
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
  dialog.showErrorBox('CheckListMakerを起動できません', GENERIC_USER_MESSAGE);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
