import type { DocumentGenerationDefinition } from '../shared/model.js';
import { terminology } from '../shared/presentation/ja/index.js';

export interface GenerationSettingsFormProps {
  generation: DocumentGenerationDefinition;
  disabled: boolean;
  onChange: (generation: DocumentGenerationDefinition) => void;
}

export const applyGenerationPatch = (
  generation: DocumentGenerationDefinition,
  patch: Partial<DocumentGenerationDefinition>
): DocumentGenerationDefinition => ({ ...generation, ...patch });

export const GenerationSettingsForm = ({ generation, disabled, onChange }: GenerationSettingsFormProps) => {
  const update = (patch: Partial<DocumentGenerationDefinition>): void => {
    onChange(applyGenerationPatch(generation, patch));
  };

  return (
    <fieldset className="generation-form" disabled={disabled}>
      <legend>{terminology.generationSettings}</legend>

      <label className="field">
        <span>{terminology.documentTitle}</span>
        <input
          name="generation-title"
          value={generation.title}
          onChange={(event) => update({ title: event.currentTarget.value })}
          autoComplete="off"
        />
      </label>

      <label className="field">
        <span>{terminology.intendedAudience}</span>
        <input
          name="generation-audience"
          value={generation.audience}
          onChange={(event) => update({ audience: event.currentTarget.value })}
          autoComplete="off"
        />
      </label>

      <label className="field full-width">
        <span>{terminology.documentPurpose}</span>
        <textarea
          name="generation-purpose"
          value={generation.purpose}
          onChange={(event) => update({ purpose: event.currentTarget.value })}
          rows={3}
        />
      </label>

      <label className="field">
        <span>{terminology.documentLanguage}</span>
        <input
          name="generation-language"
          value={generation.language}
          onChange={(event) => update({ language: event.currentTarget.value })}
          autoComplete="off"
        />
      </label>

      <label className="field">
        <span>{terminology.outputFormat}</span>
        <select
          name="generation-format"
          value={generation.requestedFormat}
          onChange={(event) =>
            update({ requestedFormat: event.currentTarget.value as DocumentGenerationDefinition['requestedFormat'] })
          }
        >
          <option value="md">Markdown（.md）</option>
          <option value="txt">テキスト（.txt）</option>
          <option value="docx">Word（.docx）</option>
        </select>
      </label>

      <label className="field full-width">
        <span>{terminology.generationInstructions}</span>
        <textarea
          name="generation-instructions"
          value={generation.instructions}
          onChange={(event) => update({ instructions: event.currentTarget.value })}
          rows={7}
          placeholder="含める章、必要な内容、文体、注意事項などを入力してください。"
        />
      </label>

      <div className="generation-options full-width" aria-label="文書生成時の制約">
        <label className="checkbox-field">
          <input
            type="checkbox"
            name="generation-use-references"
            checked={generation.useReferencesAsFacts}
            onChange={(event) => update({ useReferencesAsFacts: event.currentTarget.checked })}
          />
          <span>参考資料を事実の根拠として使用する</span>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            name="generation-prohibit-unsupported"
            checked={generation.prohibitUnsupportedClaims}
            onChange={(event) => update({ prohibitUnsupportedClaims: event.currentTarget.checked })}
          />
          <span>参考資料にない事実を推測で補わない</span>
        </label>
      </div>
    </fieldset>
  );
};
