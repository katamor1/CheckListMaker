const CLOSE_PENDING_MESSAGE = '終了確認中のため、新しい操作を開始できません。';

export class SessionOperationQueue {
  #tail: Promise<void> = Promise.resolve();
  #tokens = new Set<symbol>();
  #closes = new Map<string, { release: () => void; task: Promise<void> }>();

  constructor(private onBlockedChange: (blocked: boolean) => void = () => undefined) {}

  get blocked(): boolean {
    return this.#tokens.size > 0;
  }

  #acquire(): () => void {
    const token = Symbol('session-operation');
    const notify = this.#tokens.size === 0;
    this.#tokens.add(token);
    if (notify) this.onBlockedChange(true);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (!this.#tokens.delete(token)) return;
      if (this.#tokens.size === 0) this.onBlockedChange(false);
    };
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.#closes.size > 0) return Promise.reject(new Error(CLOSE_PENDING_MESSAGE));
    const release = this.#acquire();
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(() => undefined, () => undefined);
    return result.finally(release);
  }

  beginClose(requestId: string, flush: () => Promise<void>): Promise<void> {
    const existing = this.#closes.get(requestId);
    if (existing) return existing.task;
    if (this.#closes.size > 0) return Promise.reject(new Error(CLOSE_PENDING_MESSAGE));
    const release = this.#acquire();
    const task = this.#tail.then(flush, flush);
    this.#tail = task.then(() => undefined, () => undefined);
    this.#closes.set(requestId, { release, task });
    return task;
  }

  cancelClose(requestId: string): void {
    const close = this.#closes.get(requestId);
    if (!close) return;
    this.#closes.delete(requestId);
    close.release();
  }

  dispose(): void {
    this.#closes.clear();
    this.#tokens.clear();
    this.onBlockedChange = () => undefined;
  }
}
