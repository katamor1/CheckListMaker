import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('shared Japanese copy usage', () => {
  it('does not redefine recurring repair policy labels in ProjectWorkspace', async () => {
    const source = await readFile('src/renderer/ProjectWorkspace.tsx', 'utf8');

    expect(source).toContain('repairPolicyLabels');
    expect(source).not.toContain("case 'auto_fix': return '安全な場合は自動修正'");
    expect(source).not.toContain("case 'suggest_only': return '修正案のみ'");
    expect(source).not.toContain("case 'do_not_modify': return '変更・具体案を禁止'");
  });
});
