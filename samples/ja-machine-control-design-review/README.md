# 設備状態監視機能 基本設計書レビュー

架空の機械制御ソフトウェア「設備状態監視機能」を題材に、既存文書レビューと文書生成を説明するデモです。固有名詞、組織、担当者、管理番号、日付、連絡先、性能値を含むすべてのデータは架空であり、実在の製品、顧客、規程、プロジェクトから転用していません。

## 最新のElectron GUIでの利用

`main`のElectron版では、「概要・文書」「参考資料」「チェックリスト」の三つのタブから、このデモをGUIだけで構成できます。具体的なクリック順と入力値は `docs/user-guide/samples-gui-demo.md` を参照してください。

## 完成済みプロジェクトから始める

5分でデモを開始する場合は、次の完成済みプロジェクトを`プロジェクトを開く`から選択します。

- 既存文書レビュー: `projects/existing-document-demo.clmproj`
- 文書生成: `projects/document-generation-demo.clmproj`

どちらも編集前に`名前を付けて保存`を実行し、TEMPまたは任意の作業フォルダへコピーしてください。GUIの自動採番や各フィールドを手作業で確認する場合は、以降を詳細入力手順として使用します。既定の`CHK-0001`／`COND-01`から項目と条件を所定の順で追加します。正式な条件IDは`COND-01`から`COND-09`です。

## デモモード

- `existing_document`: `existing-document/target/basic-design-before-review.docx`（`basic-design-before-review.docx`）をレビュー前のDOCX主対象として評価します。
- `document_generation`: `generation/document-request.json`の設定をGUIへ入力し、同じ参考資料群を根拠にDOCXの基本設計書初稿を生成します。

## GUI共通設定

- プロジェクト既定の修正方針: `suggest_only`（修正案のみ）
- チェックリスト名: `基本設計レビュー完全チェックリスト`
- 参考資料ロール: `ROLE-001`／`品質基準`／必須／推奨権威レベル`approved`

チェック項目と条件は次の順で作成します。この順序を変えると条件IDも変わるため、期待結果と照合する場合は新規プロジェクトから作り直してください。

| 項目 | 条件の結合 | 修正方針 | 条件IDと種類 |
|---|---|---|---|
| `CHK-0001` 目的と適用範囲 | AND | 既定を継承 | `COND-01` 意味・内容、`COND-02` 必須語句 |
| `CHK-0002` 曖昧表現と主要パラメータ | OR | `auto_fix` | `COND-03` 禁止語句、`COND-04` 数値 |
| `CHK-0003` 承認とスケジュール | AND | `do_not_modify` | `COND-05` 文字数・件数、`COND-06` 日付・期限 |
| `CHK-0004` 文書情報 | OR | `suggest_only` | `COND-07` 書式パターン、`COND-08` 許可値 |
| `CHK-0005` 参考資料整合性 | AND | `auto_fix` | `COND-09` 参考資料整合性 |

## 参考資料と優先順位

四つの参考資料は常に読み取り専用です。権威レベルの `binding > approved > working > reference` を先に比較し、同じ権威レベルでは数値優先順位の大きい資料を優先します。IDを確実に固定するため、GUIでは次の順に1件ずつ追加します。

| ID | ファイル | 表示名 | 権威レベル | 優先順位 | 用途 | `品質基準`ロール |
|---|---|---|---|---:|---|---|
| `REF-001` | `quality-assurance-policy.pdf` | 品質保証規程（デモ） | `binding` | 100 | 必須品質規則と禁止事項 | 割り当てる |
| `REF-002` | `basic-design-template.md` | 基本設計テンプレート | `approved` | 80 | 必須章、記載項目、順序 | 割り当てる |
| `REF-003` | `control-terminology.txt` | 制御用語集 | `working` | 60 | 用語と表記の統一 | 割り当てない |
| `REF-004` | `reference-design.docx` | 設備状態監視機能 参考設計書 | `reference` | 40 | 上位資料と矛盾しない記述例 | 割り当てない |

参考資料そのものは修正対象にしません。PDFである`quality-assurance-policy.pdf`は評価と参照にだけ使用し、編集できません。

## 文書生成設定

`generation/document-request.json`は、Electron版の`DocumentGenerationDefinition`と同じプロパティ名を使用します。GUIへ次を入力します。

- 文書タイトル: 設備状態監視機能 基本設計書
- 想定読者: 制御ソフトウェア設計者および品質保証担当者
- 文書の目的: 承認レビュー用の基本設計書初稿を作成する
- 言語: `ja`
- 生成形式: Word (`docx`)
- 参考資料を事実の根拠として使用する: オン
- 参考資料にない事実を推測で補わない: オン
- 文書生成指示: JSONの`instructions`を使用する

## 期待結果の扱い

`existing-document/expected-outcomes.json`（`expected-outcomes.json`）はデモ内容を説明するための非権威データです。AIへの入力ではなく、実行によって生成された権威ある結果でもありません。正式な`result.json`は、生成したCopilot用ZIPをCopilotで実行し、同梱バリデータに合格した時点で`outputs/result.json`として作成されます。
