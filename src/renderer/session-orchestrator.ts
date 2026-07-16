import {
  GENERIC_USER_PRESENTATION,
  KNOWN_USER_ERROR_CODES,
  isUserFacingErrorPresentation,
  type UserFacingErrorPresentation
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

export interface RendererUserFacingError {
  code: string;
  presentation: UserFacingErrorPresentation;
}

export const normalizeRendererError = (
  error: unknown
): RendererUserFacingError | unknown => {
  if (!error || typeof error !== 'object') return error;
  const candidate = error as Record<string, unknown>;
  if (Object.keys(candidate).some((key) => !['brand', 'code', 'presentation'].includes(key))) return error;
  if (
    candidate['brand'] !== RENDERER_ERROR_BRAND ||
    typeof candidate['code'] !== 'string' ||
    !KNOWN_USER_ERROR_CODES.has(candidate['code']) ||
    !isUserFacingErrorPresentation(candidate['presentation'])
  ) return error;
  return {
    code: candidate['code'],
    presentation: candidate['presentation']
  };
};

export const safeRendererError = (error: unknown): RendererUserFacingError => {
  const normalized = normalizeRendererError(error);
  if (
    normalized &&
    typeof normalized === 'object' &&
    'code' in normalized &&
    'presentation' in normalized &&
    typeof normalized.code === 'string' &&
    isUserFacingErrorPresentation(normalized.presentation)
  ) {
    return normalized as RendererUserFacingError;
  }
  return {
    code: 'INTERNAL_ERROR',
    presentation: GENERIC_USER_PRESENTATION
  };
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
    const activeRequests = new Map<string, symbol>();
    const unsubscribeFlush = this.options.bridge.onFlushBeforeClose((requestId) => {
      const marker = activeRequests.get(requestId) ?? Symbol(requestId);
      activeRequests.set(requestId, marker);
      const closing = this.options.operationQueue.beginClose(requestId, async () => {
        if (activeRequests.get(requestId) !== marker) return;
        await this.options.synchronizer.flush();
        if (activeRequests.get(requestId) !== marker) return;
        await this.options.bridge.closeReady(requestId);
      });
      void closing.catch((error: unknown) => {
        if (activeRequests.get(requestId) === marker) this.options.reportError(error);
      });
    });
    const unsubscribeCanceled = this.options.bridge.onCloseCanceled((requestId) => {
      activeRequests.delete(requestId);
      this.options.operationQueue.cancelClose(requestId);
    });
    let cleanedUp = false;
    return () => {
      if (cleanedUp) return;
      cleanedUp = true;
      unsubscribeFlush();
      unsubscribeCanceled();
      activeRequests.clear();
      this.options.operationQueue.dispose();
    };
  }
}
