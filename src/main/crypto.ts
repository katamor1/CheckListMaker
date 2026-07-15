import { createHash } from 'node:crypto';

export const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

const canonicalizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalizeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalizeValue(child)])
    );
  }
  return value;
};

export const canonicalJson = (value: unknown): string =>
  JSON.stringify(canonicalizeValue(value));

export const jsonBytes = (value: unknown): Uint8Array =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
