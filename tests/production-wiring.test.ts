import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Task 5 production wiring', () => {
  it('routes Main IPC and window close through the tested Electron adapter', async () => {
    const source = await readFile(new URL('../src/main/main.ts', import.meta.url), 'utf8');

    expect(source).toContain("from './electron-adapter.js'");
    expect(source).toContain('registerElectronIpc({');
    expect(source).toContain('wireWindowCloseGuard({');
    expect(source.match(/ipcMain\.handle/g)).toHaveLength(1);
  });

  it('routes App session actions, edits, and close lifecycle through the tested orchestrator', async () => {
    const source = await readFile(new URL('../src/renderer/App.tsx', import.meta.url), 'utf8');

    expect(source).toContain("from './session-orchestrator.js'");
    expect(source).toContain('new RendererSessionOrchestrator({');
    expect(source).toContain('orchestrator.runSessionOperation(');
    expect(source).toContain('orchestrator.commitProject(');
    expect(source).toContain('orchestrator.subscribeClose()');
  });
});
