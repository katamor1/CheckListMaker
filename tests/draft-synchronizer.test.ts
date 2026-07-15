import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import { DraftSynchronizer, applyDraftEdit } from '../src/renderer/draft-synchronizer.js';

describe('DraftSynchronizer', () => {
  it('assigns ordered revisions and flushes the latest update', async () => {
    const sent: number[] = [];
    const send = vi.fn(async (_project, revision: number) => {
      sent.push(revision);
      return { accepted: true, revision };
    });
    const synchronizer = new DraftSynchronizer(send, 3);
    const project = createProject('document_generation');

    expect(synchronizer.enqueue(project)).toBe(4);
    expect(synchronizer.enqueue({ ...project, name: '更新' })).toBe(5);
    await synchronizer.flush();
    expect(sent).toEqual([4, 5]);
  });

  it('resets revision after a Main session replacement', async () => {
    const send = vi.fn().mockImplementation(async (_project, revision: number) => ({ accepted: true, revision }));
    const synchronizer = new DraftSynchronizer(send, 7);
    synchronizer.reset(0);
    expect(synchronizer.enqueue(createProject('existing_document'))).toBe(1);
    await synchronizer.flush();
  });

  it('continues with a later update after an earlier sync rejection', async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error('sync failed'))
      .mockResolvedValueOnce({ accepted: true, revision: 2 });
    const synchronizer = new DraftSynchronizer(send, 0);
    const project = createProject('document_generation');
    synchronizer.enqueue(project);
    synchronizer.enqueue({ ...project, name: '再同期' });
    await expect(synchronizer.flush()).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('rejects flush when Main refuses the newest revision', async () => {
    const send = vi.fn().mockResolvedValue({ accepted: false, revision: 8 });
    const synchronizer = new DraftSynchronizer(send, 8);
    synchronizer.enqueue(createProject('document_generation'));
    await expect(synchronizer.flush()).rejects.toThrow(
      '最新の編集内容を同期できませんでした。操作を中止しました。'
    );
  });

  it('preserves consecutive edits to different fields without a React rerender', () => {
    let snapshot = { project: createProject('document_generation'), dirty: false, revision: 0 };
    const enqueue = vi.fn().mockReturnValueOnce(1).mockReturnValueOnce(2);
    snapshot = applyDraftEdit(snapshot, (current) => ({ ...current, name: '更新名' }), enqueue);
    snapshot = applyDraftEdit(snapshot, (current) => ({
      ...current,
      generation: { ...current.generation!, instructions: '最新の生成指示' }
    }), enqueue);

    expect(snapshot.project.name).toBe('更新名');
    expect(snapshot.project.generation?.instructions).toBe('最新の生成指示');
    expect(snapshot.revision).toBe(2);
  });

  it('does not enqueue a draft while a session operation barrier is active', () => {
    const snapshot = { project: createProject('document_generation'), dirty: false, revision: 0 };
    const enqueue = vi.fn();
    expect(applyDraftEdit(snapshot, (current) => ({ ...current, name: '拒否' }), enqueue, true))
      .toBe(snapshot);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
