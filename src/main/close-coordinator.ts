export class CloseCoordinator {
  #pending: {
    id: string;
    resolve: (value: boolean) => void;
    timer: ReturnType<typeof setTimeout>;
  } | undefined;

  #state: 'idle' | 'flushing' | 'guarding' | 'approved' = 'idle';

  constructor(private readonly createRequestId: () => string) {}

  get isGuarding(): boolean {
    return this.#state === 'flushing' || this.#state === 'guarding';
  }

  get closeApproved(): boolean {
    return this.#state === 'approved';
  }

  requestFlush(send: (requestId: string) => void, timeoutMs: number): Promise<boolean> {
    if (this.#state !== 'idle') return Promise.resolve(false);
    const id = this.createRequestId();
    this.#state = 'flushing';

    return new Promise<boolean>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending = undefined;
        this.#state = 'idle';
        resolve(false);
      }, timeoutMs);
      this.#pending = { id, resolve, timer };

      try {
        send(id);
      } catch (error) {
        clearTimeout(timer);
        this.#pending = undefined;
        this.#state = 'idle';
        reject(error);
      }
    });
  }

  acknowledge(requestId: string): void {
    if (!this.#pending || this.#pending.id !== requestId) return;
    const pending = this.#pending;
    this.#pending = undefined;
    clearTimeout(pending.timer);
    this.#state = 'guarding';
    pending.resolve(true);
  }

  approveClose(): void {
    if (this.#state === 'guarding') this.#state = 'approved';
  }

  cancelClose(): void {
    if (this.#state === 'guarding') this.#state = 'idle';
  }

  abortClose(): void {
    const pending = this.#pending;
    this.#pending = undefined;
    if (pending) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.#state = 'idle';
  }
}

export type CloseOutcome = 'approved' | 'canceled' | 'flush-timeout';

export const coordinateClose = async (
  coordinator: CloseCoordinator,
  sendFlush: (requestId: string) => void,
  guardUnsaved: () => Promise<boolean>,
  timeoutMs: number
): Promise<CloseOutcome> => {
  try {
    if (!(await coordinator.requestFlush(sendFlush, timeoutMs))) return 'flush-timeout';
    if (!(await guardUnsaved())) {
      coordinator.cancelClose();
      return 'canceled';
    }
    coordinator.approveClose();
    return 'approved';
  } catch (error) {
    coordinator.abortClose();
    throw error;
  }
};
