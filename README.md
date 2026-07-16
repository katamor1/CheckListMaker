# CheckListMaker

CheckListMakerは、非エンジニアでも文書レビュー用のチェックリストを作成し、ブラウザチャット型のCopilotへ渡す**自己検証可能な実行パッケージ**を生成できる、Windows向けローカルアプリケーションです。

アプリ自身はAI APIを呼び出しません。利用者がローカルでプロジェクトとチェックリストを作成し、生成したZIPをCopilotへ手動でアップロードします。Copilotは文書を評価・必要に応じて修正した後、同梱されたPythonバリデータで`result.json`の構造と内部整合性を検証します。

> [!WARNING]
> 現在はElectronへの再プラットフォーム作業中です。安定版リリースはまだありません。`npm run dist:portable`で生成できるEXEは開発・受入試験用であり、Windows 11上の受入確認を終えるまでは本番配布しないでください。

## 目次

- [できること](#できること)
- [利用の流れ](#利用の流れ)
- [チェックリストの表現力](#チェックリストの表現力)
- [ファイル形式](#ファイル形式)
- [Copilot実行パッケージ](#copilot実行パッケージ)
- [セキュリティとプライバシー](#セキュリティとプライバシー)
- [開発環境](#開発環境)
- [開発コマンド](#開発コマンド)
- [WindowsポータブルEXEの作成](#windowsポータブルexeの作成)
- [リリース手順](#リリース手順)
- [現在の制約と未完了項目](#現在の制約と未完了項目)
- [日本語UI文言](#日本語ui文言)
- [設計資料](#設計資料)

## できること

### 1. 既存文書をチェックする

主対象文書を1件登録し、複数の参考資料と照合しながらチェックできます。

| 形式 | 評価 | 自動修正 | 備考 |
|---|---:|---:|---|
| Markdown `.md` | 対応 | 対応 | 修正版を生成可能 |
| Text `.txt` | 対応 | 対応 | 修正版を生成可能 |
| Word `.docx` | 対応 | 条件付き | 基本書式を可能な範囲で保持 |
| PDF `.pdf` | 対応 | 非対応 | 参照・評価・修正提案のみ |

### 2. 命令から文書を生成してチェックする

既存文書の代わりに文書生成命令を登録できます。Copilotは次の順で処理します。

1. 初稿を生成する
2. 初稿をチェックリストで評価する
3. 許可された項目だけを修正する
4. 最終稿を再評価する
5. 構造化結果をPythonで検証する

生成形式はMarkdown、TXT、DOCXです。PDF生成はMVP対象外です。

### 3. 参考資料の優先順位を管理する

参考資料には、固定された権威レベルと`0`から`100`の優先順位を設定できます。

```text
binding > approved > working > reference
```

権威レベルが同じ場合は、数値の大きい資料を優先します。同順位の資料に矛盾がある場合、Copilotは推測で決めず、確認が必要な状態として記録します。

### 4. 修正可能範囲を制御する

文書全体の既定値は安全側の`suggest_only`です。チェック項目ごとに上書きできます。

| 修正方針 | 動作 |
|---|---|
| `auto_fix` | 情報と編集条件が揃う場合だけ修正文書へ反映 |
| `suggest_only` | 原文を変更せず、具体的な修正案を記録 |
| `do_not_modify` | 問題、根拠、確認事項だけを記録 |

### 5. 再利用可能なプロジェクトとテンプレートを保存する

- `.clmproj`: 対象文書、参考資料、チェックリスト、設定を含むプロジェクト
- `.clmcheck`: 文書を含まず、チェックリストと設定だけを保持するテンプレート

どちらもZIPベースの非暗号化コンテナです。保存先のWindowsアクセス権や組織の端末管理で保護してください。

## 利用の流れ

安定版リリース後の基本フローは次のとおりです。

1. CheckListMakerを起動する
2. 「既存文書を検証」または「文書を生成して検証」を選ぶ
3. 主対象文書または文書生成命令を設定する
4. 参考資料を追加し、用途・権威レベル・優先順位を設定する
5. チェック項目を作成するか、`.clmcheck`を読み込む
6. 事前検査でエラーと警告を確認する
7. Copilot用ZIPをエクスポートする
8. ZIPをPython実行機能のあるブラウザ版Copilotへアップロードする
9. `01_EXECUTION_PROMPT.md`をCopilotへ送信する
10. Copilotが最初に`python validate_output.py --self-test`を実行したことを確認する
11. 完了後、`outputs/result.json`と関連成果物をダウンロードする

`result.json`が結果の正本です。人間向けMarkdownレポートや修正文書は副本として扱います。

## チェックリストの表現力

### 条件の結合

1つのチェック項目に複数条件を設定し、次のどちらかで結合できます。

- `all`: すべて満たす（AND）
- `any`: いずれかを満たす（OR）

MVPでは入れ子の論理式は扱いません。

### 9種類の条件

| 条件タイプ | 用途例 |
|---|---|
| `semantic` | 目的、明確性、整合性などを自然言語で判断 |
| `required_text` | 必須語句が含まれることを確認 |
| `forbidden_text` | 禁止語句が含まれないことを確認 |
| `number` | 数値の上限・下限・範囲を確認 |
| `length_or_count` | 文字数、段落数、見出し数、出現回数などを確認 |
| `date_or_deadline` | 日付の存在、前後関係、期限を確認 |
| `pattern` | メール、URL、管理番号、カスタム正規表現などを確認 |
| `one_of` | 許可された選択肢のいずれかであることを確認 |
| `cross_source_consistency` | 主対象文書と参考資料の整合性を確認 |

### 4種類の評価範囲

- 文書全体
- 見出し・章
- 表
- 自然言語で指定した箇所

指定箇所が見つからない場合は、条件ごとに「不適合」または「確認が必要」を選べます。

### 必須・任意と全体判定

全体状態は次の4種類です。

| 全体状態 | 意味 |
|---|---|
| `passed` | 必須・任意とも問題なし |
| `passed_with_warnings` | 必須は適合、任意項目に問題あり |
| `failed` | 必須項目に未修正の不適合あり |
| `needs_information` | 必須項目の判定・修正に情報不足あり |

## ファイル形式

### `.clmproj`

プロジェクトの再編集用ファイルです。主な内容は次のとおりです。

```text
project.json
checklist.json
target/TARGET.<ext>                  # 既存文書モード
generation/document-generation.json # 文書生成モード
references/REF-001.<ext>
manifest.json
```

### `.clmcheck`

チェックリストテンプレートです。対象文書や参考資料の実体は含めません。

```text
template.json
checklist.json
manifest.json
```

### 保存時の安全対策

- アーカイブ内部パスをASCII・相対パスに限定
- 絶対パス、ドライブ指定、バックスラッシュ、`.`、`..`を拒否
- 重複エントリを拒否
- ファイル数・個別サイズ・合計展開サイズに上限を設定
- 各ファイルをSHA-256で検証
- 一時ファイルへ保存・再検証してから置き換え
- 元文書を直接変更しない

## Copilot実行パッケージ

エクスポートされるZIPには、概ね次のファイルが含まれます。

```text
00_READ_ME_FIRST.md
01_EXECUTION_PROMPT.md
02_CONTINUE_PROMPT.md
package-contract.json
checklist.json
output-schema.json
validate_output.py
result.example.json
validator-tests/
├── valid-minimal.json
└── invalid-missing-item.json
target/TARGET.<ext>                  # 既存文書モード
generation/document-generation.json # 文書生成モード
references/
└── REF-001.<ext>
manifest.json
```

### Pythonバリデータ

生成される`validate_output.py`はPython 3.9以上の標準ライブラリだけで動作します。

```bash
python validate_output.py --self-test

python validate_output.py \
  --input outputs/result.draft.json \
  --output-dir . \
  --report outputs/validation-report.json \
  --attempt 1
```

終了コードは次のとおりです。

| 終了コード | 意味 |
|---:|---|
| `0` | 構造と内部整合性の検証に合格 |
| `1` | 結果JSONに検証エラーあり |
| `2` | ファイル不足、入力不正、実行環境エラー |

検証は最大5回です。5回失敗した場合、`result.json`を確定してはいけません。

> [!IMPORTANT]
> Python検証の合格は、文書内容が事実として正しいことを証明しません。保証するのは、結果JSONの形式、ID網羅性、集計、修正方針などの内部整合性です。

## セキュリティとプライバシー

CheckListMakerはローカル専用・オフライン前提です。

- AI APIを呼び出さない
- Copilotのブラウザ操作を自動化しない
- テレメトリ、自動更新、外部CDNを使用しない
- Rendererの`nodeIntegration`を無効化
- `contextIsolation`とsandboxを有効化
- 外部ナビゲーションと新規ウィンドウを拒否
- 本番画面からHTTP/HTTPS通信を拒否
- ファイル操作を用途限定IPCへ閉じ込める
- 対象文書と参考資料を「命令」ではなく未信頼データとして扱う

次の点には注意してください。

- `.clmproj`、`.clmcheck`、Copilot用ZIPは暗号化されません
- ファイルには対象文書や参考資料の実体が含まれます
- Copilotへのアップロードは利用者が明示的に行います
- 組織の情報管理ルールとCopilot利用条件を確認してください

## 開発環境

### 必須

- Windows 11 x64（リリースビルド・受入試験）
- Node.js 22以上
- npm 10以上を推奨
- Git

配布先にはNode.js、npm、TypeScript、.NET、Rust、Pythonをインストールする必要はありません。Electronが必要なChromiumとNode.jsを同梱します。

### セットアップ

```powershell
git clone https://github.com/katamor1/CheckListMaker.git
cd CheckListMaker
git checkout agent/replatform-electron
npm install
```

現時点では`package-lock.json`が未整備です。ロックファイル導入後は、開発・CIともに`npm ci`へ切り替えてください。

## 開発コマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | Vite、TypeScript監視、Electronを開発モードで起動 |
| `npm run start` | 本番ビルド後にElectronを起動 |
| `npm run typecheck` | MainとRendererのTypeScript型検査 |
| `npm test` | Vitestを一括実行 |
| `npm run build` | MainとRendererを本番ビルド |
| `npm run verify` | 型検査、テスト、ビルドを順に実行 |
| `npm run clean` | `dist`などの生成物を削除 |
| `npm run dist:portable` | 検証後、Windows x64ポータブルEXEを生成 |

### 開発起動

```powershell
npm run dev
```

### リリース前のローカル検証

```powershell
npm run verify
```

1工程でも失敗した場合は、リリース用EXEを公開しないでください。

## WindowsポータブルEXEの作成

Electron版は、利用者へ渡すファイルを1つにしたポータブル配布を採用します。起動時に内部ファイルが一時展開され、複数プロセスで動作することは仕様上許容します。

```powershell
npm install
npm run dist:portable
```

配布対象の成果物は次です。

```text
artifacts/portable/CheckListMaker.exe
```

`electron-builder`が生成する中間ディレクトリや補助ファイルは、利用者へ配布する成果物ではありません。

現在の設定は次のとおりです。

- Windows x64
- Portableターゲット
- 管理者権限不要（`requestExecutionLevel: user`）
- ASAR有効
- 配布ファイル名: `CheckListMaker.exe`
- コード署名なし

コード署名が必要な組織では、証明書と署名手順が承認されるまで公開配布しないでください。

## リリース手順

### 1. バージョンを更新する

次の値を同じバージョンへ更新します。

- `package.json`の`version`
- `src/shared/model.ts`の`APPLICATION_VERSION`
- `CHANGELOG.md`（導入後）

MVPの初期バージョンは`0.1.0`、プロジェクト／パッケージ形式は`1.0`です。アプリのバージョンとファイル形式のバージョンは別々に管理します。

### 2. クリーンなWindows環境で検証する

```powershell
npm install
npm run verify
npm run dist:portable
```

### 3. SHA-256を記録する

```powershell
Get-FileHash .\artifacts\portable\CheckListMaker.exe -Algorithm SHA256
```

リリースノートにはEXEのSHA-256を記載してください。

### 4. 手動受入を実施する

最低限、次をWindows 11 x64のクリーン環境で確認します。

- 管理者権限なしで起動できる
- 読み取り専用または共有フォルダからの起動条件を確認する
- 新規プロジェクトを作成、保存、再度開ける
- `.clmcheck`を保存、再度開ける
- MD、TXT、DOCX、PDFを登録できる
- Copilot用ZIPを生成できる
- ZIP内の`validate_output.py --self-test`がPython 3.9以上で成功する
- ネットワーク無効状態でもプロジェクト保存とZIP生成ができる
- キーボードだけで主要操作を完了できる
- 100%、150%、200%の表示倍率で操作できる
- エラー時に元のプロジェクトファイルが失われない
- 未署名EXEに対するSmartScreen、EDR、組織ポリシーの挙動を確認する

### 5. タグとGitHub Releaseを作成する

すべての自動・手動受入に合格した後だけ実施します。

```powershell
git tag -a v0.1.0 -m "CheckListMaker 0.1.0"
git push origin v0.1.0
```

GitHub Releaseには次を添付・記載します。

- `CheckListMaker.exe`
- SHA-256
- 変更点
- 対応OSと制約
- 既知の問題
- コード署名の有無

自動更新機能はありません。更新時は新しいEXEへ手動で差し替えます。

## 現在の制約と未完了項目

現在の`agent/replatform-electron`ブランチは開発途中です。

### 実装済みのコア

- TypeScriptのドメインモデル
- 9種類の条件と4種類のスコープ
- プロジェクト事前検査
- 安全なZIP読込・書込とSHA-256マニフェスト
- `.clmproj`／`.clmcheck`の保存ロジック
- JSON SchemaとPythonバリデータを含むCopilotパッケージ生成
- Electron Main Processの用途限定IPC
- 外部通信・外部ナビゲーションの拒否
- Portable EXE向け`electron-builder`設定

### リリース前に必要な作業

- PreloadとRendererの完成・Main Processとの統合
- Reactのウィザード、ワークスペース、9条件フォームの完成
- 単体テストと統合テストの整備
- `package-lock.json`のコミット
- Electron用GitHub Actionsの整備
- Windows上での`npm run verify`成功確認
- WindowsポータブルEXE生成とクリーン環境受入
- キーボード操作と表示倍率の確認
- コード署名方針の確定

これらが完了するまで、リポジトリ上の成果物を安定版として扱わないでください。

## 日本語UI文言

Electron画面、通知、事前検査、ファイルダイアログ、利用者向けエラーでは、正確さを優先した専門的な日本語を使用します。共通文言は`src/shared/presentation/ja/`で管理し、利用者向けの英語装飾見出しや、生のOS・Node.js例外文を通常画面へ表示しません。

文言変更では、型検査、Vitest、サンプル検証、本番ビルドに加え、Windows 11上でキーボード操作と100%、150%、200%の表示倍率を確認します。手動確認が未実施の項目は、視覚的な受入完了として扱いません。

- [日本語UI文言設計](docs/superpowers/specs/2026-07-16-electron-japanese-ui-copy-design.md)
- [日本語UI文言の手動確認チェックリスト](docs/testing/electron-japanese-ui-copy-checklist.md)

## MVP対象外

- AI APIとの直接接続
- Copilotブラウザの自動操作
- Copilot成果物のCheckListMakerへの再取り込み
- クラウド保存、同期、共同編集
- 複数ユーザー、認証、権限管理
- PDFの編集
- 複数の主対象文書
- 入れ子になったAND/OR
- DOCX書式の完全保持保証
- 自動更新

## 設計資料

- [MVP設計仕様](docs/superpowers/specs/2026-07-14-checklistmaker-mvp-design.md)
- [Electron再プラットフォームADR](docs/decisions/0001-electron-replatform.md)
- [Electron移行ステータス](docs/implementation/2026-07-15-electron-replatform-status.md)
- [日本語UI文言設計](docs/superpowers/specs/2026-07-16-electron-japanese-ui-copy-design.md)
- [日本語UI文言実装ステータス](docs/implementation/2026-07-16-japanese-ui-copy-status.md)

## 開発方針

- テスト駆動で実装する
- ファイル形式とエラーコードを安定した契約として扱う
- 文書内容とファイルパスをログやエラーへ不用意に出さない
- 外部依存は最小限にし、バージョンを固定する
- 自動検証に合格しても、手動受入なしにリリース完了と宣言しない
