import { rm } from 'node:fs/promises';

for (const path of ['dist', 'artifacts/portable']) {
  await rm(path, { recursive: true, force: true });
}
