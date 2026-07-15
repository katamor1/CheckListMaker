import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: repositoryRoot,
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
