import { IPC } from '../shared/ipc.js';
import {
  GENERIC_USER_PRESENTATION,
  UserFacingError,
  runIpcOperation
} from '../shared/ipc-result.js';
import { userFacingErrors } from '../shared/presentation/ja/index.js';
import {
  registerElectronIpc,
  type IpcSenderEvent
} from './electron-adapter.js';
import {
  SESSION_INVOKE_CHANNELS,
  type SessionHandlerMap
} from './session-handlers.js';

export interface ApplicationVersions {
  application: string;
  electron: string;
  node: string;
  chrome: string;
}

export interface MainIpcBindingOptions<
  TEvent extends IpcSenderEvent,
  TOwner
> {
  removeHandler(channel: string): void;
  installHandler(
    channel: string,
    listener: (event: TEvent, ...args: unknown[]) => Promise<unknown>
  ): void;
  resolveOwner(sender: TEvent['sender']): TOwner | undefined;
  handlersFor(owner: TOwner): SessionHandlerMap;
  allowedOutputPaths: ReadonlySet<string>;
  showItemInFolder(path: string): void;
  versions(): ApplicationVersions;
  reportUnexpected(error: unknown): void;
}

export const registerMainIpcBindings = <
  TEvent extends IpcSenderEvent,
  TOwner
>(options: MainIpcBindingOptions<TEvent, TOwner>): void => {
  registerElectronIpc({
    allChannels: Object.values(IPC),
    sessionChannels: SESSION_INVOKE_CHANNELS,
    directHandlers: [
      {
        channel: IPC.openFolder,
        operation: (_event: TEvent, rawPath: unknown) => {
          if (typeof rawPath !== 'string') {
            throw new UserFacingError('INVALID_ARGUMENT', userFacingErrors.invalidArgument);
          }
          if (!options.allowedOutputPaths.has(rawPath)) {
            throw new UserFacingError('OUTPUT_NOT_ALLOWED', userFacingErrors.outputNotAllowed);
          }
          options.showItemInFolder(rawPath);
        }
      },
      {
        channel: IPC.versions,
        operation: () => options.versions()
      }
    ],
    removeHandler: options.removeHandler,
    installHandler: options.installHandler,
    runSafely: (operation) => runIpcOperation(operation, options.reportUnexpected),
    resolveOwner: options.resolveOwner,
    handlersFor: options.handlersFor,
    ownerUnavailable: () => {
      throw new UserFacingError('WINDOW_UNAVAILABLE', GENERIC_USER_PRESENTATION);
    }
  });
};
