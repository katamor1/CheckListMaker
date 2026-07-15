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

type RuntimeIpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export interface PreloadIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

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
    typeof envelope.error.code === 'string' &&
    typeof envelope.error.message === 'string'
  ) {
    throw new Error(envelope.error.message);
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
