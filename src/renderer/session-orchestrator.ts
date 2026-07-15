import {
  GENERIC_USER_MESSAGE,
  RENDERER_USER_ERROR_NAME_PREFIX,
  isSafeUserMessage
} from '../shared/ipc-result.js';
import type {
  AppBridge,
  ProjectDefinition,
  SessionSnapshot
} from '../shared/model.js';
import { applyDraftEdit } from './draft-synchronizer.js';

type CloseBridge = Pick<
  AppBridge,
  'onFlushBeforeClose' | 'onCloseCanceled' | 'closeReady'
>;

export interface SessionSummaryRef {
  current: SessionSnapshot | null;
}

export interface DraftSynchronizerPort {
  enqueue(project: ProjectDefinition): number;
  flush(): Promise<void>;
  reset(revision: number): void;
}

export interface SessionOperationQueuePort {
  readonly blocked: boolean;
  run<T>(operation: () => Promise<T>): Promise<T>;
  beginClose(requestId: string, flush: () => Promise<void>): Promise<void>;
  cancelClose(requestId: string): void;
  dispose(): void;
}

export interface RendererSessionOrchestratorOptions {
  bridge: CloseBridge;
  summaryRef: SessionSummaryRef;
  synchronizer: DraftSynchronizerPort;
  operationQueue: SessionOperationQueuePort;
  publishSummary(summary: SessionSnapshot): void;
  reportError(error: unknown): void;
}

export const RENDERER_ERROR_BRAND = 'checklistmaker.renderer-user-error.v1' as const;

export const normalizeRendererError = (error: unknown): unknown => {
  if (!error || typeof error !== 'object') return error;
  const candidate = error as { brand?: unknown; code?: unknown; message?: unknown };
  if (
    candidate.brand !== RENDERER_ERROR_BRAND ||
    typeof candidate.code !== 'string' ||
    typeof candidate.message !== 'string' ||
    !isSafeUserMessage(candidate.code, candidate.message)
  ) return error;
  const trusted = new Error(candidate.message);
  trusted.name = `${RENDERER_USER_ERROR_NAME_PREFIX}${candidate.code}`;
  return trusted;
};

export const safeRendererErrorMessage = (error: unknown): string => {
  if (!(error instanceof Error) || !error.name.startsWith(RENDERER_USER_ERROR_NAME_PREFIX)) {
    return GENERIC_USER_MESSAGE;
  }
  const code = error.name.slice(RENDERER_USER_ERROR_NAME_PREFIX.length);
  return isSafeUserMessage(code, error.message) ? error.message : GENERIC_USER_MESSAGE;
};

export class RendererSessionOrchestrator {
  constructor(private readonly options: RendererSessionOrchestratorOptions) {}

  adoptSummary(next: SessionSnapshot): void {
    this.options.synchronizer.reset(next.revision);
    this.options.summaryRef.current = next;
    this.options.publishSummary(next);
  }

  commitProject(
    update: (project: ProjectDefinition) => ProjectDefinition
  ): SessionSnapshot | null {
    const current = this.options.summaryRef.current;
    if (!current) return null;
    const next = applyDraftEdit(
      current,
      update,
      (project) => this.options.synchronizer.enqueue(project),
      this.options.operationQueue.blocked
    );
    if (next === current) return current;
    this.options.summaryRef.current = next;
    this.options.publishSummary(next);
    return next;
  }

  runSessionOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.options.operationQueue.run(async () => {
      await this.options.synchronizer.flush();
      return operation();
    });
    void result.catch((error: unknown) => {
      this.options.reportError(error);
    });
    return result;
  }

  subscribeClose(): () => void {
    const unsubscribeFlush = this.options.bridge.onFlushBeforeClose((requestId) => {
      const closing = this.options.operationQueue.beginClose(requestId, async () => {
        await this.options.synchronizer.flush();
        await this.options.bridge.closeReady(requestId);
      });
      void closing.catch((error: unknown) => {
        this.options.reportError(error);
      });
    });
    const unsubscribeCanceled = this.options.bridge.onCloseCanceled((requestId) => {
      this.options.operationQueue.cancelClose(requestId);
    });
    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      unsubscribeFlush();
      unsubscribeCanceled();
      this.options.operationQueue.dispose();
    };
  }
}
