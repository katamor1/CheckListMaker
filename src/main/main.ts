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

const requireOwner = (event: IpcMainInvokeEvent): BrowserWindow => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner) {
    throw new UserFacingError('WINDOW_UNAVAILABLE', GENERIC_USER_MESSAGE);
  }
  return owner;
};

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

const handle = <TArgs extends unknown[], TResult>(
  channel: string,
  operation: (event: IpcMainInvokeEvent, ...args: TArgs) => Promise<TResult> | TResult
): void => {
  ipcMain.handle(channel, (event, ...rawArgs: unknown[]) =>
    runIpcOperation(
      () => operation(event, ...(rawArgs as TArgs)),
      (error) => console.error(error)
    )
  );
};

const registerIpc = (): void => {
  for (const channel of Object.values(IPC)) ipcMain.removeHandler(channel);

  for (const channel of SESSION_INVOKE_CHANNELS) {
    handle(channel, (event, ...args: unknown[]) => {
      const owner = requireOwner(event);
      const handlers = createSessionHandlers(createHandlerDependencies(owner));
      return handlers[channel]({ senderId: event.sender.id }, ...args);
    });
  }

  handle(IPC.openFolder, async (_event, rawPath: unknown) => {
    if (typeof rawPath !== 'string') {
      throw new UserFacingError('INVALID_ARGUMENT', '入力データが不正です。');
    }
    if (!allowedOutputPaths.has(rawPath)) {
      throw new UserFacingError('OUTPUT_NOT_ALLOWED', 'この場所を開く権限がありません。');
    }
    shell.showItemInFolder(rawPath);
  });

  handle(IPC.versions, () => ({
    application: APPLICATION_VERSION,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome
  }));
};

const registerCloseGuard = (window: BrowserWindow): void => {
  const senderId = window.webContents.id;
  const coordinator = new CloseCoordinator(randomUUID);
  closeCoordinators.set(senderId, coordinator);

  window.on('closed', () => {
    closeCoordinators.delete(senderId);
  });

  window.on('close', (event) => {
    if (coordinator.closeApproved) return;
    event.preventDefault();
    if (coordinator.isGuarding) return;

    const ports = createOwnerBoundPorts(window);
    let requestId: string | undefined;
    void coordinateClose(
      coordinator,
      (nextRequestId) => {
        requestId = nextRequestId;
        window.webContents.send(IPC.flushBeforeClose, nextRequestId);
      },
      () => manager.runExclusive(() => guardUnsavedSession(manager, ports)),
      CLOSE_FLUSH_TIMEOUT_MS
    ).then(async (outcome) => {
      if (outcome === 'approved') {
        window.close();
        return;
      }
      if (requestId && !window.isDestroyed()) {
        window.webContents.send(IPC.closeCanceled, requestId);
      }
      if (outcome === 'flush-timeout' && !window.isDestroyed()) {
        await showSafeError(window, CLOSE_FLUSH_TIMEOUT_MESSAGE);
      }
    }).catch(async (error: unknown) => {
      coordinator.abortClose();
      if (requestId && !window.isDestroyed()) {
        window.webContents.send(IPC.closeCanceled, requestId);
      }
      console.error(error);
      if (!window.isDestroyed()) await showSafeError(window, GENERIC_USER_MESSAGE);
    });
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
