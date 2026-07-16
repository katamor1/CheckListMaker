import type { ConditionDefinition } from '../shared/model.js';
import { linesToValues, valuesToLines, type ConditionFieldsProps } from './condition-field-utils.js';

type TextCondition = Extract<ConditionDefinition, { type: 'semantic' | 'required_text' | 'forbidden_text' }>;
type TextConditionFieldsProps = Omit<ConditionFieldsProps, 'condition' | 'references'> & { condition: TextCondition };

export const TextConditionFields = ({ condition, disabled, onChange }: TextConditionFieldsProps) => {
  switch (condition.type) {
    case 'semantic':
      return (
        <label className="field full-width">
          <span>判断してほしい内容</span>
          <textarea
            name={`condition-semantic-instruction-${condition.id}`}
            value={condition.instruction}
            onChange={(event) => onChange({ ...condition, instruction: event.currentTarget.value })}
            placeholder="例: 文書の目的が具体的で検証可能であること"
            rows={4}
            disabled={disabled}
          />
        </label>
      );

    case 'required_text':
      return (
        <>
          <label className="field full-width">
            <span>必須語句（1行に1件）</span>
            <textarea
              name={`condition-required-values-${condition.id}`}
              value={valuesToLines(condition.values)}
              onChange={(event) => onChange({ ...condition, values: linesToValues(event.currentTarget.value) })}
              rows={4}
              disabled={disabled}
            />
          </label>
          <label className="field">
            <span>必須語句の満たし方</span>
            <select
              name={`condition-required-match-${condition.id}`}
              value={condition.matchMode}
              onChange={(event) => onChange({ ...condition, matchMode: event.currentTarget.value as 'all' | 'any' })}
              disabled={disabled}
            >
              <option value="all">すべての語句が必要</option>
              <option value="any">いずれかの語句が必要</option>
            </select>
          </label>
          <label className="checkbox-field align-end">
            <input
              type="checkbox"
              name={`condition-required-case-${condition.id}`}
              checked={condition.caseSensitive}
              onChange={(event) => onChange({ ...condition, caseSensitive: event.currentTarget.checked })}
              disabled={disabled}
            />
            <span>大文字・小文字を区別する</span>
          </label>
        </>
      );

    case 'forbidden_text':
      return (
        <>
          <label className="field full-width">
            <span>禁止語句（1行に1件）</span>
            <textarea
              name={`condition-forbidden-values-${condition.id}`}
              value={valuesToLines(condition.values)}
              onChange={(event) => onChange({ ...condition, values: linesToValues(event.currentTarget.value) })}
              rows={4}
              disabled={disabled}
            />
          </label>
          <label className="checkbox-field full-width">
            <input
              type="checkbox"
              name={`condition-forbidden-case-${condition.id}`}
              checked={condition.caseSensitive}
              onChange={(event) => onChange({ ...condition, caseSensitive: event.currentTarget.checked })}
              disabled={disabled}
            />
            <span>大文字・小文字を区別する</span>
          </label>
        </>
      );
  }
};
