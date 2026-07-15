import type { ConditionDefinition } from '../shared/model.js';
import type { ConditionReferenceOption } from './condition-editor-types.js';

export const linesToValues = (value: string): string[] =>
  value.split(/\r?\n/).map((entry) => entry.trim()).filter((entry) => entry.length > 0);

export const valuesToLines = (values: readonly string[]): string => values.join('\n');

export const setOptional = <T extends object>(
  value: T,
  key: string,
  raw: string,
  convert: (input: string) => unknown
): T => {
  const next = { ...value } as Record<string, unknown>;
  if (raw === '') delete next[key];
  else next[key] = convert(raw);
  return next as T;
};

export interface ConditionFieldsProps {
  condition: ConditionDefinition;
  references: readonly ConditionReferenceOption[];
  disabled: boolean;
  onChange(condition: ConditionDefinition): void;
}
