export interface ValidationPresentation {
  title: string;
  remediation: string;
}

export const validationMessages = Object.freeze({
  PROJECT_NAME_REQUIRED: {
    title: 'プロジェクト名が入力されていません。',
    remediation: 'プロジェクト名を入力してください。'
  },
  TARGET_REQUIRED: {
    title: '主対象文書が選択されていません。',
    remediation: 'MD、TXT、DOCX、またはPDFの主対象文書を選択してください。'
  },
  GENERATION_REQUIRED: {
    title: '文書生成設定がありません。',
    remediation: '文書生成と検証を開始して、文書生成設定を入力してください。'
  },
  GENERATION_TITLE_REQUIRED: {
    title: '文書タイトルが入力されていません。',
    remediation: '生成する文書のタイトルを入力してください。'
  },
  GENERATION_INSTRUCTIONS_REQUIRED: {
    title: '文書生成指示が入力されていません。',
    remediation: '生成する文書に含める内容、構成、文体、注意事項を入力してください。'
  },
  PDF_AUTOFIX_WARNING: {
    title: 'PDFには自動修正を適用できません。',
    remediation: '既定修正方針を「修正案のみ」に変更するか、この警告を確認したうえで続行してください。'
  },
  REFERENCE_ID_DUPLICATE: {
    title: '参考資料IDが重複しています。',
    remediation: '重複している参考資料を削除し、追加し直してください。'
  },
  REFERENCE_PRIORITY_INVALID: {
    title: '参考資料の優先順位が範囲外です。',
    remediation: '同一権威レベル内の優先順位を0から100の整数で指定してください。'
  },
  REFERENCE_PRECEDENCE_TIE: {
    title: '同じ権威レベルと優先順位の参考資料があります。',
    remediation: '資料が矛盾した場合に判断できるよう、同一権威レベル内の優先順位を見直してください。'
  },
  CHECK_ITEM_ID_INVALID: {
    title: 'チェック項目IDの形式が不正です。',
    remediation: 'チェック項目を削除し、追加し直してください。'
  },
  CHECK_ITEM_ID_DUPLICATE: {
    title: 'チェック項目IDが重複しています。',
    remediation: '重複しているチェック項目を削除してください。'
  },
  CHECK_ITEM_TITLE_REQUIRED: {
    title: 'チェック項目名が入力されていません。',
    remediation: 'チェック項目名を入力してください。'
  },
  CONDITION_GROUP_EMPTY: {
    title: 'チェック項目に条件がありません。',
    remediation: 'チェック項目へ1件以上の条件を追加してください。'
  },
  REQUIRED_ITEM_NA_WARNING: {
    title: '必須項目で「対象外」を許可しています。',
    remediation: '必須項目として意図した設定か確認してください。'
  },
  CONDITION_ID_INVALID: {
    title: '条件IDの形式が不正です。',
    remediation: '条件を削除し、追加し直してください。'
  },
  CONDITION_ID_DUPLICATE: {
    title: '条件IDが重複しています。',
    remediation: '重複している条件を削除し、追加し直してください。'
  },
  SCOPE_HEADING_REQUIRED: {
    title: '評価対象の見出しが入力されていません。',
    remediation: '評価対象とする章または見出しを入力してください。'
  },
  SCOPE_TABLE_REQUIRED: {
    title: '評価対象の表が指定されていません。',
    remediation: '対象表を特定できる説明を入力してください。'
  },
  SCOPE_LOCATOR_REQUIRED: {
    title: '評価対象箇所の説明が入力されていません。',
    remediation: '評価対象箇所を自然言語で説明してください。'
  },
  SEMANTIC_INSTRUCTION_REQUIRED: {
    title: '意味判定の内容が入力されていません。',
    remediation: '文書について判断する内容を入力してください。'
  },
  TEXT_VALUES_REQUIRED: {
    title: '確認する語句が入力されていません。',
    remediation: '必須語句または禁止語句を1件以上入力してください。'
  },
  NUMBER_SUBJECT_REQUIRED: {
    title: '確認する数値の名称が入力されていません。',
    remediation: '予算、監視周期など、確認対象の数値名を入力してください。'
  },
  NUMBER_RANGE_INVALID: {
    title: '数値範囲が不正です。',
    remediation: '最小値が最大値以下になるよう修正してください。'
  },
  NUMBER_VALUE_REQUIRED: {
    title: '数値の比較値が入力されていません。',
    remediation: '比較に使用する数値を入力してください。'
  },
  COUNT_RANGE_INVALID: {
    title: '文字数または件数の範囲が不正です。',
    remediation: '最小値が最大値以下になるよう修正してください。'
  },
  COUNT_VALUE_REQUIRED: {
    title: '文字数または件数の比較値が入力されていません。',
    remediation: '比較に使用する値を入力してください。'
  },
  DATE_SUBJECT_REQUIRED: {
    title: '確認する日付の名称が入力されていません。',
    remediation: '提出期限、改訂日など、確認対象の日付名を入力してください。'
  },
  DATE_RANGE_INVALID: {
    title: '日付範囲が不正です。',
    remediation: '開始日が終了日以前になるよう修正してください。'
  },
  DATE_VALUE_REQUIRED: {
    title: '基準日が入力されていません。',
    remediation: '比較に使用する日付を入力してください。'
  },
  PATTERN_REQUIRED: {
    title: '書式パターンが入力されていません。',
    remediation: 'プリセットを選択するか、正規表現を入力してください。'
  },
  PATTERN_INVALID: {
    title: '正規表現を解釈できません。',
    remediation: '正規表現の構文を修正してください。'
  },
  ONE_OF_VALUES_REQUIRED: {
    title: '許可する選択肢が入力されていません。',
    remediation: '確認対象と、許可する値を1件以上入力してください。'
  },
  CONSISTENCY_INSTRUCTION_REQUIRED: {
    title: '参考資料との整合性を確認する内容が入力されていません。',
    remediation: '主対象文書と参考資料の何を照合するか入力してください。'
  },
  REFERENCE_ID_UNKNOWN: {
    title: '存在しない参考資料が条件に指定されています。',
    remediation: '登録済みの参考資料を選択してください。'
  }
} satisfies Record<string, ValidationPresentation>);

export const presentationForValidationCode = (
  code: string,
  fallback: ValidationPresentation
): ValidationPresentation => validationMessages[
  code as keyof typeof validationMessages
] ?? fallback;
