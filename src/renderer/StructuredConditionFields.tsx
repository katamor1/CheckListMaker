import type { ConditionDefinition } from '../shared/model.js';
import { patternPresetDetails } from './checklist-editor-model.js';
import { linesToValues, valuesToLines, type ConditionFieldsProps } from './condition-field-utils.js';

type StructuredCondition = Extract<ConditionDefinition, { type: 'pattern' | 'one_of' | 'cross_source_consistency' }>;
type StructuredConditionFieldsProps = Omit<ConditionFieldsProps, 'condition'> & { condition: StructuredCondition };

export const StructuredConditionFields = ({ condition, references, disabled, onChange }: StructuredConditionFieldsProps) => {
  switch (condition.type) {
    case 'pattern':
      return (
        <>
          <label className="field">
            <span>パターン</span>
            <select
              name={`condition-pattern-preset-${condition.id}`}
              value={condition.preset}
              onChange={(event) => {
                const preset = event.currentTarget.value as typeof condition.preset;
                const details = patternPresetDetails[preset];
                onChange({ ...condition, preset, pattern: details.pattern, description: details.description });
              }}
              disabled={disabled}
            >
              <option value="email">メールアドレス</option>
              <option value="url">URL</option>
              <option value="phone">電話番号</option>
              <option value="postal_code">郵便番号</option>
              <option value="iso_date">ISO日付</option>
              <option value="management_number">管理番号</option>
              <option value="custom">カスタム正規表現</option>
            </select>
          </label>
          <label className="field">
            <span>説明</span>
            <input
              name={`condition-pattern-description-${condition.id}`}
              value={condition.description}
              onChange={(event) => onChange({ ...condition, description: event.currentTarget.value })}
              disabled={disabled}
            />
          </label>
          {condition.preset === 'custom' ? (
            <label className="field full-width">
              <span>正規表現</span>
              <input
                name={`condition-pattern-value-${condition.id}`}
                value={condition.pattern}
                onChange={(event) => onChange({ ...condition, pattern: event.currentTarget.value })}
                spellCheck={false}
                disabled={disabled}
              />
            </label>
          ) : (
            <p className="read-only-value full-width"><strong>使用する式:</strong> <code>{condition.pattern}</code></p>
          )}
        </>
      );

    case 'one_of':
      return (
        <>
          <label className="field">
            <span>確認対象</span>
            <input
              name={`condition-one-of-subject-${condition.id}`}
              value={condition.subject}
              onChange={(event) => onChange({ ...condition, subject: event.currentTarget.value })}
              placeholder="例: 機密区分"
              disabled={disabled}
            />
          </label>
          <label className="field full-width">
            <span>許可値（1行に1件）</span>
            <textarea
              name={`condition-one-of-values-${condition.id}`}
              value={valuesToLines(condition.allowedValues)}
              onChange={(event) => onChange({ ...condition, allowedValues: linesToValues(event.currentTarget.value) })}
              rows={4}
              disabled={disabled}
            />
          </label>
        </>
      );

    case 'cross_source_consistency':
      return (
        <>
          <label className="field full-width">
            <span>照合内容</span>
            <textarea
              name={`condition-consistency-instruction-${condition.id}`}
              value={condition.instruction}
              onChange={(event) => onChange({ ...condition, instruction: event.currentTarget.value })}
              placeholder="例: 監視周期を選択したすべての参考資料と照合する"
              rows={4}
              disabled={disabled}
            />
          </label>
          <fieldset className="compact-fieldset full-width">
            <legend>照合する参考資料</legend>
            {references.length === 0 ? (
              <p className="empty-state compact">先に「参考資料」タブで資料を登録してください。</p>
            ) : (
              <div className="checkbox-grid">
                {references.map((reference) => (
                  <label className="checkbox-field" key={reference.id}>
                    <input
                      type="checkbox"
                      name={`condition-source-${reference.id}-${condition.id}`}
                      checked={condition.sourceIds.includes(reference.id)}
                      onChange={(event) => onChange({
                        ...condition,
                        sourceIds: event.currentTarget.checked
                          ? [...condition.sourceIds, reference.id]
                          : condition.sourceIds.filter((sourceId) => sourceId !== reference.id)
                      })}
                      disabled={disabled}
                    />
                    <span>{reference.id} · {reference.title}</span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        </>
      );
  }
};
