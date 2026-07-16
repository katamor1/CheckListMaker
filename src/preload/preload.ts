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

const ACCEPTED_ERROR_CODES: ReadonlySet<string> = new Set([
  'INVALID_ARGUMENT',
  'OUTPUT_NOT_ALLOWED',
  'WINDOW_UNAVAILABLE',
  'PROJECT_REQUIRED',
  'PROJECT_OPEN_FAILED',
  'PROJECT_DOCUMENT_MISMATCH',
  'PROJECT_MISMATCH',
  'PROJECT_INVALID',
  'PROJECT_SAVE_FAILED',
  'PROJECT_DIRTY',
  'PACKAGE_EXPORT_FAILED',
  'DOCUMENT_REGISTER_FAILED',
  'TEMPLATE_SAVE_FAILED',
  'TEMPLATE_OPEN_FAILED',
  'INTERNAL_ERROR'
]);

interface RuntimePresentation {
  title: string;
  message: string;
  dataSafety?: string;
  nextAction?: string;
}

type RuntimeIpcResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        brand?: unknown;
        code?: unknown;
        presentation?: unknown;
      };
    };

export interface PreloadIpc {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
  removeListener(channel: string, listener: (event: unknown, ...args: unknown[]) => void): void;
}

const validText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 2_000;

const isPresentation = (value: unknown): value is RuntimePresentation => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !['title', 'message', 'dataSafety', 'nextAction'].includes(key))) return false;
  if (!validText(candidate['title']) || !validText(candidate['message'])) return false;
  if (candidate['dataSafety'] !== undefined && !validText(candidate['dataSafety'])) return false;
  if (candidate['nextAction'] !== undefined && !validText(candidate['nextAction'])) return false;
  return true;
};

const trustedRendererEnvelope = (code: string, presentation: RuntimePresentation) => ({
  brand: PRELOAD_RENDERER_ERROR_BRAND,
  code,
  presentation
});

const genericRendererEnvelope = () => ({
  brand: PRELOAD_RENDERER_ERROR_BRAND,
  code: 'INTERNAL_ERROR',
  presentation: null
});

const invokeSafely = async <T>(ipc: PreloadIpc, channel: string, ...args: unknown[]): Promise<T> => {
  let result: unknown;
  try {
    result = await ipc.invoke(channel, ...args);
  } catch {
    throw genericRendererEnvelope();
  }
  if (!result || typeof result !== 'object' || !('ok' in result)) {
    throw genericRendererEnvelope();
  }
  const envelope = result as RuntimeIpcResult<T>;
  if (envelope.ok === true && 'value' in envelope) return envelope.value;
  if (envelope.ok !== false || !envelope.error || typeof envelope.error !== 'object') {
    throw genericRendererEnvelope();
  }
  const errorKeys = Object.keys(envelope.error);
  if (errorKeys.some((key) => !['brand', 'code', 'presentation'].includes(key))) {
    throw genericRendererEnvelope();
  }
  if (
    envelope.error.brand === PRELOAD_USER_ERROR_BRAND &&
    typeof envelope.error.code === 'string' &&
    ACCEPTED_ERROR_CODES.has(envelope.error.code) &&
    isPresentation(envelope.error.presentation)
  ) {
    throw trustedRendererEnvelope(envelope.error.code, envelope.error.presentation);
  }
  throw genericRendererEnvelope();
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
