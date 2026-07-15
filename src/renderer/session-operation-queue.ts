const CLOSE_PENDING_MESSAGE = '終了確認中のため、新しい操作を開始できません。';

export class SessionOperationQueue {
  #tail: Promise<void> = Promise.resolve();
  #tokens = new Set<symbol>();
  #closes = new Map<string, {
    previousTail: Promise<void>;
    release: () => void;
    task: Promise<void>;
    tail: Promise<void>;
  }>();

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
    const previousTail = this.#tail;
    const task = previousTail.then(flush, flush);
    const tail = task.then(() => undefined, () => undefined);
    this.#tail = tail;
    this.#closes.set(requestId, { previousTail, release, task, tail });
    return task;
  }

  cancelClose(requestId: string): void {
    const close = this.#closes.get(requestId);
    if (!close) return;
    this.#closes.delete(requestId);
    if (this.#tail === close.tail) this.#tail = close.previousTail;
    close.release();
  }

  dispose(): void {
    for (const close of this.#closes.values()) {
      if (this.#tail === close.tail) this.#tail = close.previousTail;
    }
    this.#closes.clear();
    this.#tokens.clear();
  }
}
