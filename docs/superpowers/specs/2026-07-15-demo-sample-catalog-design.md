# CheckListMaker デモサンプルカタログ設計

- 作成日: 2026-07-15
- 対象リポジトリ: `katamor1/CheckListMaker`
- 対象ブランチ: `agent/implement-checklistmaker-mvp`
- 状態: 承認済み

## 1. 目的

CheckListMaker の主要機能を、機密情報を含まない日本語の架空資料で説明・検証できるデモサンプルをリポジトリへ登録する。

サンプルは次の二つの用途を同時に満たす。

1. 利用者やレビュアーが、対象文書、参考資料、チェック項目、期待結果の関係を理解できるデモ資料。
2. Domain JSON 契約、将来のコンテナ、パッケージ生成、ヘッドレスワークフロー、Windows 受入試験で再利用できる固定 fixture。

## 2. 採用方針

サンプル本体と Domain 契約 fixture を分離した二層構成を採用する。

- `samples/` は人が読めるデモ資料と機械可読カタログを保持する。
- `tests/CheckListMaker.Domain.Tests/Fixtures/complete-project.json` は現在の Domain 公開契約を固定する。
- 実装されていない `.clmproj`、`.clmcheck`、Copilot 実行 ZIP は手作業で先行作成しない。
- 後続 Plan 2、3、4、6 は、同じサンプルソースから正式なコンテナ、ゴールデンパッケージ、受入 fixture を生成する。

## 3. デモシナリオ

架空の機械制御ソフトウェア「設備状態監視機能」の基本設計書レビューを題材とする。

既存文書モードでは、レビュー前の DOCX 基本設計書を主対象とし、権威レベルと優先順位が異なる四つの参考資料を用いて評価する。文書生成モードでは、同じ参考資料群を根拠として基本設計書の初稿を生成する指示を使用する。

固有名詞、担当者、組織、管理番号、日付、メールアドレス、性能値はすべて架空データとする。実在製品、顧客、社内規程、既存プロジェクトから本文を転用しない。

## 4. リポジトリ構成

```text
samples/
├── README.md
├── catalog.json
├── catalog.schema.json
├── validate_samples.py
└── ja-machine-control-design-review/
    ├── README.md
    ├── sample-manifest.json
    ├── existing-document/
    │   ├── target/
    │   │   └── basic-design-before-review.docx
    │   └── expected-outcomes.json
    ├── generation/
    │   └── document-request.json
    └── references/
        ├── quality-assurance-policy.pdf
        ├── basic-design-template.md
        ├── control-terminology.txt
        └── reference-design.docx

tests/CheckListMaker.Domain.Tests/
├── Fixtures/
│   └── complete-project.json
└── Serialization/
    └── ProjectContractRoundTripTests.cs
```

リポジトリ内部パスは ASCII とし、文書内の表示名は日本語とする。これにより Git、ZIP、Python、Windows パス処理の差異を抑えながら、日本語利用時の表示を確認できる。

## 5. カタログ契約

### 5.1 `catalog.json`

カタログは登録済みサンプルの一覧だけを持つ。各エントリには次を必須とする。

- `id`: 安定した小文字 ASCII ID。
- `manifestPath`: リポジトリルートからの相対パス。
- `title`: 日本語表示名。
- `description`: サンプルの目的。
- `modes`: `existing_document`、`document_generation` の一つ以上。
- `status`: 初回登録時は `active`。

未知のプロパティ、重複 ID、絶対パス、`..` を含むパス、存在しない manifest を拒否する。エントリ順は `id` の昇順で固定する。

### 5.2 `sample-manifest.json`

サンプル manifest は、サンプルの説明とファイル対応を保持する。

- `sampleFormatVersion`: `1.0`。
- `id`、`title`、`description`、`language`。
- モード別 entry point。
- 各ファイルの相対パス、用途、メディアタイプ、SHA-256、サイズ。
- 参考資料の安定 ID、表示名、ロール、権威レベル、優先順位。
- 期待する主要な判定と、デモで確認すべき操作。

SHA-256 はファイルの生バイト列に対する小文字 16 進表記とする。サイズはバイト単位とする。manifest 自身はファイル一覧へ含めない。

### 5.3 `catalog.schema.json`

標準ライブラリだけで検証できる範囲の JSON Schema を提供する。外部 URL、外部参照、ネットワーク取得を必要とする定義は使用しない。

### 5.4 `validate_samples.py`

Python 3.9 以上の標準ライブラリだけを使用し、次を検証する。

- カタログと manifest の構造。
- ID とパスの一意性、安全性。
- 参照ファイルの存在、サイズ、SHA-256。
- 許可されたモード、メディアタイプ、権威レベル。
- `catalog.json` と各 manifest の相互参照。

終了コードは、成功 `0`、サンプル不正 `1`、実行環境または入力読込失敗 `2` とする。文書本文の意味的妥当性は検証対象外とする。

## 6. サンプル資料

### 6.1 主対象 DOCX

レビュー前の基本設計書は、次の特徴を意図的に混在させる。

- 正常なタイトル、目的、対象範囲。
- 必須語句が存在する箇所と不足する箇所。
- 禁止された曖昧表現。
- 許容範囲外の数値。
- 期待件数を満たす表と満たさない表。
- 期限または改訂日の記載。
- 管理番号の書式。
- 許可値の候補。
- 参考資料間照合が必要な用語または値。

これにより、`valid` だけでなく `invalid`、`needs_information`、修正方針別の挙動を説明できる。

### 6.2 参考資料

| ファイル | 権威レベル | 優先順位 | 主用途 |
|---|---|---:|---|
| `quality-assurance-policy.pdf` | `binding` | 100 | 必須品質規則と禁止事項 |
| `basic-design-template.md` | `approved` | 80 | 必須章、表、記載順序 |
| `control-terminology.txt` | `working` | 60 | 用語と表記の統一 |
| `reference-design.docx` | `reference` | 40 | 記述例。上位資料と矛盾した場合は採用しない |

各資料は常に読み取り専用として扱い、修正対象にしない。

### 6.3 文書生成指示

`document-request.json` は、目的、読者、言語、要求形式、生成指示、参考資料を事実根拠として使う設定、根拠のない主張を禁止する設定を持つ。生成形式は DOCX とし、PDF は指定しない。

### 6.4 期待結果

`expected-outcomes.json` は説明用の非権威データとし、少なくとも次を記録する。

- 期待する必須項目の不合格。
- 任意項目の警告。
- `auto_fix`、`suggest_only`、`do_not_modify` の代表例。
- 参考資料優先順位による解決例。
- 情報不足として止める例。

正式な `result.json` 形式は Plan 3 の OutputContract 生成後に追加し、このファイルを代用しない。

## 7. Domain 完全 fixture

`complete-project.json` は次を一つの既存文書プロジェクトで網羅する。

- DOCX 主対象。
- imported-template origin。
- 必須参考資料ロール。
- 二つ以上の権威レベルと異なる優先順位。
- 九つの条件タイプ。
- 四つのスコープタイプ。
- `all` と `any` の両条件結合。
- プロジェクト既定 `suggest_only`。
- 既定を継承する項目と、`auto_fix`、`do_not_modify` へ上書きする項目。
- null を省略した camelCase プロパティと snake_case enum。

条件 ID は承認済み MVP 設計の `COND-0001` 形式へ統一する。現行コードの `COND-01` 正規表現と Plan 1 内の古い例は、実装時にテスト先行で修正する。チェック項目 ID は `CHK-0001`、参考資料 ID は `REF-001` とする。

fixture は Domain の公開 JSON 契約だけを固定し、未実装の修正結果、証拠、OutputContract フィールドを先行定義しない。

## 8. テストと検証

実装は次の順で行う。

1. カタログ検証の失敗テストを追加する。
2. Domain ID と JSON ラウンドトリップの失敗テストを追加する。
3. 最小のサンプル資料、カタログ、fixture、検証コードを追加する。
4. Python 検証を実行する。
5. .NET 10 環境で Domain テスト、全体ビルド、全体テストを実行する。

Domain ラウンドトリップテストは、fixture を読み込み、正規化してシリアライズし、再度読み込んだ結果を同じ正規化規則でシリアライズしてバイト一致を確認する。単なる record/list の参照等価性には依存しない。

現在の作業環境には .NET 10 SDK がないため、Python と静的検査はローカルで実行し、.NET 検証は SDK を利用できる Windows または CI 環境で完了させる。未実行の検証を成功として報告しない。

## 9. 後続計画との接続

- Plan 2: `complete-project.json` とサンプル資料から正式な existing/generation `.clmproj` と `.clmcheck` fixture を生成する。
- Plan 3: 同じ入力から決定論的な Copilot ZIP、Schema、Python validator、valid/invalid result fixture を生成する。
- Plan 4: ヘッドレス workflow でサンプルの import、保存、template、preflight、export を通す。
- Plan 5: 将来アプリ内デモ一覧を追加する場合、カタログを直接永続設定へ登録せず、埋め込みリソースから私有 workspace へコピーして開く。
- Plan 6: `tests/acceptance/fixtures/` で同じソースを再利用し、Windows Sandbox 受入試験を行う。

## 10. 対象外

- アプリ UI からのワンクリック読込。
- Windows Registry や最近使用したファイル一覧への登録。
- `.clmproj`、`.clmcheck`、Copilot ZIP の手作業による先行固定。
- Copilot の実行またはブラウザ自動化。
- 文書内容の正しさを Python が意味的に判定すること。
- 実在資料または機密資料の利用。

## 11. 完了条件

- `samples/catalog.json` から登録サンプルと全ファイルを一意に解決できる。
- MD、TXT、DOCX、PDF の合成資料が存在し、manifest のサイズと SHA-256 が一致する。
- 既存文書と文書生成の両モードが登録されている。
- Domain fixture が九条件、四スコープ、両論理、三修正方針、参考資料優先順位を網羅する。
- Python 検証が成功し、破損カタログまたはハッシュ不一致を失敗として検出する。
- .NET 10 環境で Domain fixture の正規化ラウンドトリップテストが成功する。
- 未実装のコンテナまたは成果物を、完成済みとして登録していない。
