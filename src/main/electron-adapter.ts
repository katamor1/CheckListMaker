import { IPC } from '../shared/ipc.js';
import type { CloseOutcome } from './close-coordinator.js';
import type {
  SessionHandlerMap,
  SessionInvokeChannel
} from './session-handlers.js';

export interface IpcSender {
  id: number;
}

export interface IpcSenderEvent {
  sender: IpcSender;
}

export interface DirectIpcHandler<TEvent extends IpcSenderEvent> {
  channel: string;
  operation(event: TEvent, ...args: unknown[]): Promise<unknown> | unknown;
}

export interface RegisterElectronIpcOptions<
  TEvent extends IpcSenderEvent,
  TOwner
> {
  allChannels: readonly string[];
  sessionChannels: readonly SessionInvokeChannel[];
  directHandlers: readonly DirectIpcHandler<TEvent>[];
  removeHandler(channel: string): void;
  installHandler(
    channel: string,
    listener: (event: TEvent, ...args: unknown[]) => Promise<unknown>
  ): void;
  runSafely<T>(operation: () => Promise<T> | T): Promise<unknown>;
  resolveOwner(sender: TEvent['sender']): TOwner | undefined;
  handlersFor(owner: TOwner): SessionHandlerMap;
  ownerUnavailable(): never;
}

export const registerElectronIpc = <
  TEvent extends IpcSenderEvent,
  TOwner
>(options: RegisterElectronIpcOptions<TEvent, TOwner>): void => {
  for (const channel of options.allChannels) options.removeHandler(channel);

  const installed = new Set<string>();
  const handle = (
    channel: string,
    operation: (event: TEvent, ...args: unknown[]) => Promise<unknown> | unknown
  ): void => {
    if (installed.has(channel)) throw new Error(`Duplicate IPC handler: ${channel}`);
    installed.add(channel);
    options.installHandler(channel, (event, ...args) =>
      options.runSafely(() => operation(event, ...args))
    );
  };

  for (const channel of options.sessionChannels) {
    handle(channel, (event, ...args) => {
      const owner = options.resolveOwner(event.sender);
      if (!owner) return options.ownerUnavailable();
      const handler = options.handlersFor(owner)[channel];
      return handler({ senderId: event.sender.id }, ...args);
    });
  }

  for (const direct of options.directHandlers) {
    handle(direct.channel, direct.operation);
  }
};

export interface CloseCoordinatorAdapter {
  readonly closeApproved: boolean;
  readonly isGuarding: boolean;
  abortClose(): void;
}

export interface WindowCloseGuardOptions<TCoordinator extends CloseCoordinatorAdapter> {
  senderId: number;
  coordinator: TCoordinator;
  coordinators: Map<number, TCoordinator>;
  onClose(listener: (event: { preventDefault(): void }) => void): void;
  onClosed(listener: () => void): void;
  send(channel: string, requestId: string): void;
  isDestroyed(): boolean;
  close(): void;
  coordinate(
    coordinator: TCoordinator,
    sendFlush: (requestId: string) => void,
    guardUnsaved: () => Promise<boolean>,
    timeoutMs: number
  ): Promise<CloseOutcome>;
  guardUnsaved(): Promise<boolean>;
  showError(message: string): Promise<void>;
  reportUnexpected(error: unknown): void;
  timeoutMs: number;
  timeoutMessage: string;
  genericMessage: string;
}

export const wireWindowCloseGuard = <TCoordinator extends CloseCoordinatorAdapter>(
  options: WindowCloseGuardOptions<TCoordinator>
): void => {
  options.coordinators.set(options.senderId, options.coordinator);
  options.onClosed(() => {
    options.coordinators.delete(options.senderId);
  });

  options.onClose((event) => {
    if (options.coordinator.closeApproved) return;
    event.preventDefault();
    if (options.coordinator.isGuarding) return;

    let requestId: string | undefined;
    void options.coordinate(
      options.coordinator,
      (nextRequestId) => {
        requestId = nextRequestId;
        options.send(IPC.flushBeforeClose, nextRequestId);
      },
      options.guardUnsaved,
      options.timeoutMs
    ).then(async (outcome) => {
      if (outcome === 'approved') {
        options.close();
        return;
      }
      if (requestId && !options.isDestroyed()) {
        options.send(IPC.closeCanceled, requestId);
      }
      if (outcome === 'flush-timeout' && !options.isDestroyed()) {
        await options.showError(options.timeoutMessage);
      }
    }).catch(async (error: unknown) => {
      options.coordinator.abortClose();
      if (requestId && !options.isDestroyed()) {
        options.send(IPC.closeCanceled, requestId);
      }
      options.reportUnexpected(error);
      if (!options.isDestroyed()) await options.showError(options.genericMessage);
    });
  });
};
