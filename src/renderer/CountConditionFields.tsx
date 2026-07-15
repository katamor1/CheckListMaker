import type { ConditionDefinition } from '../shared/model.js';
import { setOptional, type ConditionFieldsProps } from './condition-field-utils.js';

type CountCondition = Extract<ConditionDefinition, { type: 'length_or_count' }>;
type CountConditionFieldsProps = Omit<ConditionFieldsProps, 'condition' | 'references'> & { condition: CountCondition };

const operatorOptions = [
  ['equal', '等しい'],
  ['less_than_or_equal', '以下'],
  ['greater_than_or_equal', '以上'],
  ['between', '範囲内']
] as const;

export const CountConditionFields = ({ condition, disabled, onChange }: CountConditionFieldsProps) => (
  <>
    <label className="field">
      <span>計測対象</span>
      <select
        name={`condition-count-measure-${condition.id}`}
        value={condition.measure}
        onChange={(event) => onChange({
          ...condition,
          measure: event.currentTarget.value as typeof condition.measure
        })}
        disabled={disabled}
      >
        <option value="characters">文字数</option>
        <option value="words">単語数</option>
        <option value="paragraphs">段落数</option>
        <option value="headings">見出し数</option>
        <option value="list_items">リスト項目数</option>
        <option value="occurrences">語句の出現回数</option>
      </select>
    </label>
    <label className="field">
      <span>演算子</span>
      <select
        name={`condition-count-operator-${condition.id}`}
        value={condition.operator}
        onChange={(event) => onChange({
          ...condition,
          operator: event.currentTarget.value as typeof condition.operator
        })}
        disabled={disabled}
      >
        {operatorOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {condition.operator === 'between' ? (
      <>
        <label className="field">
          <span>最小値</span>
          <input
            name={`condition-count-minimum-${condition.id}`}
            type="number"
            min="0"
            value={condition.minimum ?? ''}
            onChange={(event) => onChange(setOptional(condition, 'minimum', event.currentTarget.value, Number))}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>最大値</span>
          <input
            name={`condition-count-maximum-${condition.id}`}
            type="number"
            min="0"
            value={condition.maximum ?? ''}
            onChange={(event) => onChange(setOptional(condition, 'maximum', event.currentTarget.value, Number))}
            disabled={disabled}
          />
        </label>
      </>
    ) : (
      <label className="field">
        <span>比較値</span>
        <input
          name={`condition-count-value-${condition.id}`}
          type="number"
          min="0"
          value={condition.value ?? ''}
          onChange={(event) => onChange(setOptional(condition, 'value', event.currentTarget.value, Number))}
          disabled={disabled}
        />
      </label>
    )}
    {condition.measure === 'occurrences' ? (
      <label className="field">
        <span>数える語句</span>
        <input
          name={`condition-count-occurrence-text-${condition.id}`}
          value={condition.occurrenceText ?? ''}
          onChange={(event) => onChange(setOptional(condition, 'occurrenceText', event.currentTarget.value, String))}
          disabled={disabled}
        />
      </label>
    ) : null}
  </>
);
