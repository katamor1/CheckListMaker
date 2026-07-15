import type { ConditionDefinition } from '../shared/model.js';
import { setOptional, type ConditionFieldsProps } from './condition-field-utils.js';

type DateCondition = Extract<ConditionDefinition, { type: 'date_or_deadline' }>;
type DateConditionFieldsProps = Omit<ConditionFieldsProps, 'condition' | 'references'> & { condition: DateCondition };

const operatorOptions = [
  ['exists', '日付が存在する'],
  ['on', '指定日と同じ'],
  ['before', '指定日より前'],
  ['on_or_before', '指定日以前'],
  ['after', '指定日より後'],
  ['on_or_after', '指定日以後'],
  ['between', '期間内'],
  ['start_on_or_before_end', '開始日が終了日以前']
] as const;

export const DateConditionFields = ({ condition, disabled, onChange }: DateConditionFieldsProps) => {
  const needsValue = !['exists', 'start_on_or_before_end'].includes(condition.operator);
  return (
    <>
      <label className="field">
        <span>確認する日付</span>
        <input
          name={`condition-date-subject-${condition.id}`}
          value={condition.subject}
          onChange={(event) => onChange({ ...condition, subject: event.currentTarget.value })}
          placeholder="例: 改訂日"
          disabled={disabled}
        />
      </label>
      <label className="field">
        <span>演算子</span>
        <select
          name={`condition-date-operator-${condition.id}`}
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
            <span>開始日</span>
            <input
              name={`condition-date-minimum-${condition.id}`}
              type="date"
              value={condition.minimum ?? ''}
              onChange={(event) => onChange(setOptional(condition, 'minimum', event.currentTarget.value, String))}
              disabled={disabled}
            />
          </label>
          <label className="field">
            <span>終了日</span>
            <input
              name={`condition-date-maximum-${condition.id}`}
              type="date"
              value={condition.maximum ?? ''}
              onChange={(event) => onChange(setOptional(condition, 'maximum', event.currentTarget.value, String))}
              disabled={disabled}
            />
          </label>
        </>
      ) : needsValue ? (
        <label className="field">
          <span>基準日</span>
          <input
            name={`condition-date-value-${condition.id}`}
            type="date"
            value={condition.value ?? ''}
            onChange={(event) => onChange(setOptional(condition, 'value', event.currentTarget.value, String))}
            disabled={disabled}
          />
        </label>
      ) : null}
    </>
  );
};
