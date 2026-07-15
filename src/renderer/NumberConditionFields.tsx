import type { ConditionDefinition } from '../shared/model.js';
import { setOptional, type ConditionFieldsProps } from './condition-field-utils.js';

type NumberCondition = Extract<ConditionDefinition, { type: 'number' }>;
type NumberConditionFieldsProps = Omit<ConditionFieldsProps, 'condition' | 'references'> & { condition: NumberCondition };

const operatorOptions = [
  ['equal', '等しい'],
  ['not_equal', '等しくない'],
  ['less_than', 'より小さい'],
  ['less_than_or_equal', '以下'],
  ['greater_than', 'より大きい'],
  ['greater_than_or_equal', '以上'],
  ['between', '範囲内']
] as const;

export const NumberConditionFields = ({ condition, disabled, onChange }: NumberConditionFieldsProps) => (
  <>
    <label className="field">
      <span>確認する数値</span>
      <input
        name={`condition-number-subject-${condition.id}`}
        value={condition.subject}
        onChange={(event) => onChange({ ...condition, subject: event.currentTarget.value })}
        placeholder="例: 監視周期"
        disabled={disabled}
      />
    </label>
    <label className="field">
      <span>演算子</span>
      <select
        name={`condition-number-operator-${condition.id}`}
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
            name={`condition-number-minimum-${condition.id}`}
            type="number"
            value={condition.minimum ?? ''}
            onChange={(event) => onChange(setOptional(condition, 'minimum', event.currentTarget.value, Number))}
            disabled={disabled}
          />
        </label>
        <label className="field">
          <span>最大値</span>
          <input
            name={`condition-number-maximum-${condition.id}`}
            type="number"
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
          name={`condition-number-value-${condition.id}`}
          type="number"
          value={condition.value ?? ''}
          onChange={(event) => onChange(setOptional(condition, 'value', event.currentTarget.value, Number))}
          disabled={disabled}
        />
      </label>
    )}
    <label className="field">
      <span>単位（任意）</span>
      <input
        name={`condition-number-unit-${condition.id}`}
        value={condition.unit ?? ''}
        onChange={(event) => onChange(setOptional(condition, 'unit', event.currentTarget.value, String))}
        placeholder="例: ms"
        disabled={disabled}
      />
    </label>
  </>
);
