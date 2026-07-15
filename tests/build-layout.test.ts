import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readJson = async (path: string): Promise<Record<string, any>> =>
  JSON.parse(await readFile(path, 'utf8')) as Record<string, any>;

describe('Electron build layout', () => {
  it.each([
    'src/renderer/index.html',
    'src/renderer/main.tsx',
    'src/renderer/App.tsx',
    'src/preload/preload.ts',
    'tsconfig.preload.json'
  ])('contains %s', async (path) => {
    await expect(access(path, constants.R_OK)).resolves.toBeUndefined();
  });

  it('emits main, preload, and renderer into the paths consumed by Electron', async () => {
    const packageJson = await readJson('package.json');
    const mainConfig = await readJson('tsconfig.main.json');
    const preloadConfig = await readJson('tsconfig.preload.json');

    expect(packageJson['main']).toBe('dist/main/main.js');
    expect(packageJson['scripts']?.['build:preload']).toBe('tsc -p tsconfig.preload.json');
    expect(mainConfig['compilerOptions']?.['outDir']).toBe('dist');
    expect(mainConfig['include']).not.toContain('src/preload/**/*.ts');
    expect(preloadConfig['compilerOptions']?.['module']).toBe('CommonJS');
    expect(preloadConfig['compilerOptions']?.['outDir']).toBe('dist/preload');
  });
});
