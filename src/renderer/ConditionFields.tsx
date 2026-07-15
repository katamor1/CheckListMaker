import type { ConditionFieldsProps } from './condition-field-utils.js';
import { NumericConditionFields } from './NumericConditionFields.js';
import { StructuredConditionFields } from './StructuredConditionFields.js';
import { TextConditionFields } from './TextConditionFields.js';

export const ConditionFields = (props: ConditionFieldsProps) => {
  switch (props.condition.type) {
    case 'semantic':
    case 'required_text':
    case 'forbidden_text':
      return <TextConditionFields {...props} condition={props.condition} />;
    case 'number':
    case 'length_or_count':
    case 'date_or_deadline':
      return <NumericConditionFields {...props} condition={props.condition} />;
    case 'pattern':
    case 'one_of':
    case 'cross_source_consistency':
      return <StructuredConditionFields {...props} condition={props.condition} />;
  }
};
