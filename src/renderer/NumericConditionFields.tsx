import type { ConditionDefinition } from '../shared/model.js';
import type { ConditionFieldsProps } from './condition-field-utils.js';
import { CountConditionFields } from './CountConditionFields.js';
import { DateConditionFields } from './DateConditionFields.js';
import { NumberConditionFields } from './NumberConditionFields.js';

type NumericCondition = Extract<ConditionDefinition, { type: 'number' | 'length_or_count' | 'date_or_deadline' }>;
type NumericConditionFieldsProps = Omit<ConditionFieldsProps, 'condition' | 'references'> & { condition: NumericCondition };

export const NumericConditionFields = (props: NumericConditionFieldsProps) => {
  switch (props.condition.type) {
    case 'number':
      return <NumberConditionFields {...props} condition={props.condition} />;
    case 'length_or_count':
      return <CountConditionFields {...props} condition={props.condition} />;
    case 'date_or_deadline':
      return <DateConditionFields {...props} condition={props.condition} />;
  }
};
