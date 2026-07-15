# 設備状態監視機能 基本設計書レビュー

架空の機械制御ソフトウェア「設備状態監視機能」を題材に、既存文書レビューと文書生成を説明するデモです。固有名詞、組織、担当者、管理番号、日付、連絡先、性能値を含むすべてのデータは架空であり、実在の製品、顧客、規程、プロジェクトから転用していません。

## デモモード

- `existing_document`: `existing-document/target/basic-design-before-review.docx`（`basic-design-before-review.docx`）をレビュー前の DOCX 主対象として評価します。
- `document_generation`: `generation/document-request.json` の依頼と同じ参考資料群を根拠に、DOCX の基本設計書初稿を生成します。

## 参考資料と優先順位

四つの参考資料は常に読み取り専用です。権威レベルの `binding > approved > working > reference` を先に比較し、同じ権威レベルでは数値優先順位の大きい資料を優先します。

| ファイル | 権威レベル | 優先順位 | 用途 |
|---|---|---:|---|
| `quality-assurance-policy.pdf` | `binding` | 100 | 必須品質規則と禁止事項 |
| `basic-design-template.md` | `approved` | 80 | 必須章、記載項目、順序 |
| `control-terminology.txt` | `working` | 60 | 用語と表記の統一 |
| `reference-design.docx` | `reference` | 40 | 記述例。上位資料との矛盾時は採用しない |

参考資料そのものは修正対象にしません。PDF である `quality-assurance-policy.pdf` は評価と参照にだけ使用し、編集できません。

## 期待結果の扱い

`existing-document/expected-outcomes.json`（`expected-outcomes.json`）はデモ内容を説明するための非権威データです。AI への入力ではありません。また、実行によって生成された権威ある結果ではありません。正式な `result.json` は Plan 3 の OutputContract が利用可能になるまで配置しません。
