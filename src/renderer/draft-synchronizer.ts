import type { DraftUpdateResult, ProjectDefinition, SessionSnapshot } from '../shared/model.js';

export type SendDraft = (project: ProjectDefinition, revision: number) => Promise<DraftUpdateResult>;

export class DraftSynchronizer {
  #revision: number;
  #pending: Promise<void> = Promise.resolve();

  constructor(private readonly send: SendDraft, revision: number) {
    this.#revision = revision;
  }

  enqueue(project: ProjectDefinition): number {
    const revision = ++this.#revision;
    const run = async (): Promise<void> => {
      const result = await this.send(project, revision);
      if (!result.accepted) {
        throw new Error('最新の編集内容を同期できませんでした。操作を中止しました。');
      }
    };
    this.#pending = this.#pending.then(run, run);
    void this.#pending.catch(() => undefined);
    return revision;
  }

  flush(): Promise<void> {
    return this.#pending;
  }

  reset(revision: number): void {
    this.#revision = revision;
    this.#pending = Promise.resolve();
  }
}

export const applyDraftEdit = (
  current: SessionSnapshot,
  update: (project: ProjectDefinition) => ProjectDefinition,
  enqueue: (project: ProjectDefinition) => number,
  blocked = false
): SessionSnapshot => {
  if (blocked) return current;
  const project = update(structuredClone(current.project));
  if (project.projectId !== current.project.projectId) {
    throw new Error('現在のプロジェクトと編集内容が一致しません。');
  }
  return { ...current, project, dirty: true, revision: enqueue(project) };
};
