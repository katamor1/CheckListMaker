import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const requiredFiles = [
  'src/renderer/index.html',
  'src/renderer/main.tsx',
  'src/preload/preload.ts',
  'tsconfig.preload.json'
];

const failures = [];
for (const path of requiredFiles) {
  try {
    await access(path, constants.R_OK);
  } catch {
    failures.push(`missing required build entry: ${path}`);
  }
}

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (packageJson.main !== 'dist/main/main.js') {
  failures.push(`package.json main must be dist/main/main.js, got ${packageJson.main}`);
}
if (packageJson.scripts?.['build:preload'] !== 'tsc -p tsconfig.preload.json') {
  failures.push('package.json must define build:preload with tsconfig.preload.json');
}

const mainConfig = JSON.parse(await readFile('tsconfig.main.json', 'utf8'));
if (mainConfig.compilerOptions?.outDir !== 'dist') {
  failures.push(`tsconfig.main.json outDir must be dist, got ${mainConfig.compilerOptions?.outDir}`);
}
if (mainConfig.include?.some((entry) => String(entry).includes('preload'))) {
  failures.push('tsconfig.main.json must not compile the CommonJS preload');
}

const preloadConfig = JSON.parse(await readFile('tsconfig.preload.json', 'utf8'));
if (preloadConfig.compilerOptions?.module !== 'CommonJS') {
  failures.push('tsconfig.preload.json module must be CommonJS for a sandboxed preload');
}
if (preloadConfig.compilerOptions?.outDir !== 'dist/preload') {
  failures.push(`tsconfig.preload.json outDir must be dist/preload, got ${preloadConfig.compilerOptions?.outDir}`);
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Electron build layout is complete.');
}
