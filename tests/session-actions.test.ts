import { describe, expect, it, vi } from 'vitest';
import { createProject } from '../src/shared/defaults.js';
import type { SessionSnapshot } from '../src/shared/model.js';
import { saveThenExport } from '../src/renderer/session-actions.js';

const dirty: SessionSnapshot = {
  project: createProject('document_generation'),
  dirty: true,
  revision: 4
};
const clean: SessionSnapshot = { ...dirty, dirty: false, revision: 5, path: 'C:\\work\\project.clmproj' };

describe('saveThenExport', () => {
  it('adopts a canceled save snapshot and never exports', async () => {
    const canceled = { ...dirty, revision: 5 };
    const bridge = {
      saveProject: vi.fn().mockResolvedValue({ canceled: true, summary: canceled }),
      exportPackage: vi.fn()
    };
    const adoptSummary = vi.fn();

    await expect(saveThenExport(dirty, bridge, adoptSummary)).resolves.toEqual({ canceled: true });

    expect(bridge.saveProject).toHaveBeenCalledWith(false);
    expect(adoptSummary).toHaveBeenCalledWith(canceled);
    expect(bridge.exportPackage).not.toHaveBeenCalled();
  });

  it('adopts a clean revision-advanced save before exporting', async () => {
    const calls: string[] = [];
    const bridge = {
      saveProject: vi.fn(async () => {
        calls.push('save');
        return { canceled: false, summary: clean };
      }),
      exportPackage: vi.fn(async () => {
        calls.push('export');
        return { canceled: false, path: 'C:\\out\\package.zip' };
      })
    };
    const adoptSummary = vi.fn(() => calls.push('adopt'));

    await expect(saveThenExport(dirty, bridge, adoptSummary)).resolves.toEqual({
      canceled: false,
      path: 'C:\\out\\package.zip'
    });

    expect(calls).toEqual(['save', 'adopt', 'export']);
    expect(adoptSummary).toHaveBeenCalledWith(clean);
  });

  it('keeps the adopted snapshot clean when ZIP destination selection is canceled', async () => {
    let current = dirty;
    const bridge = {
      saveProject: vi.fn().mockResolvedValue({ canceled: false, summary: clean }),
      exportPackage: vi.fn().mockResolvedValue({ canceled: true })
    };

    await expect(saveThenExport(dirty, bridge, (next) => { current = next; })).resolves.toEqual({
      canceled: true
    });

    expect(current).toEqual(clean);
    expect(current.dirty).toBe(false);
  });

  it('keeps the saved revision adopted when export rejects', async () => {
    let current = dirty;
    const bridge = {
      saveProject: vi.fn().mockResolvedValue({ canceled: false, summary: clean }),
      exportPackage: vi.fn().mockRejectedValue(new Error('export failed'))
    };

    await expect(saveThenExport(dirty, bridge, (next) => { current = next; })).rejects.toThrow('export failed');

    expect(current).toEqual(clean);
    expect(current.revision).toBe(5);
    expect(current.dirty).toBe(false);
  });

  it('exports an already-clean snapshot without saving it again', async () => {
    const bridge = {
      saveProject: vi.fn(),
      exportPackage: vi.fn().mockResolvedValue({ canceled: false, path: 'C:\\out\\package.zip' })
    };
    const adoptSummary = vi.fn();

    await expect(saveThenExport(clean, bridge, adoptSummary)).resolves.toMatchObject({ canceled: false });

    expect(bridge.saveProject).not.toHaveBeenCalled();
    expect(adoptSummary).not.toHaveBeenCalled();
    expect(bridge.exportPackage).toHaveBeenCalledOnce();
  });
});
