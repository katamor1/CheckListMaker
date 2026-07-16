# Electron GUI フルサンプル・プロジェクト設計

- 状態: 承認済み
- 作成日: 2026-07-16
- 対象ブランチ: `main`
- 対象アプリケーション: Electron / React版 CheckListMaker 0.1.0

## 目的

設備状態監視機能のフルデモを、利用者が全項目を手入力せずに開始できるようにする。既存文書レビュー用と文書生成用の完成済み`.clmproj`をサンプルとして収録し、GUIの`プロジェクトを開く`から直接利用できるようにする。

## 方針変更

既存のサンプル設計と手順書は、GUIの入力操作とID自動採番を確認するため、完成済み`.clmproj`を意図的に収録していなかった。本設計はその制約を変更し、次の二つを両立させる。

- 5分程度で主要機能を確認できる完成済みプロジェクトのクイックデモ
- 全項目、入力順、ID採番を確認できる既存の詳細入力手順

`.clmcheck`と実行後の`result.json`は引き続き収録しない。

## 成果物

次の自己完結型プロジェクトを追加する。

| モード | ファイル | 固定projectId |
|---|---|---|
| 既存文書レビュー | `samples/ja-machine-control-design-review/projects/existing-document-demo.clmproj` | `00000000-0000-4000-8000-000000000101` |
| 文書生成 | `samples/ja-machine-control-design-review/projects/document-generation-demo.clmproj` | `00000000-0000-4000-8000-000000000102` |

両プロジェクトの`createdAt`と`updatedAt`は`2026-07-16T00:00:00.000Z`に固定する。外側のファイル名はASCIIとし、Windows、Git、ZIPツール間での文字コード差を避ける。

## 収録内容

両プロジェクトは、現行のサンプル説明と同じ次の完成済み設定を持つ。

- 参考資料4件: `REF-001`から`REF-004`
- 必須参考資料ロール1件: `ROLE-001`（品質基準）
- チェック項目5件: `CHK-0001`から`CHK-0005`
- 条件9件: `COND-01`から`COND-09`
- 条件タイプ9種類を各1回使用
- スコープ4種類をすべて使用
- プロジェクト既定の修正方針: `suggest_only`
- 事前検査: エラー0件、警告0件

既存文書レビュー用プロジェクトは、`basic-design-before-review.docx`を主対象として内包する。文書生成用プロジェクトは完成済みの文書生成設定を内包し、主対象文書を持たない。両方とも次の参考資料実体を内包する。

- `quality-assurance-policy.pdf`
- `basic-design-template.md`
- `control-terminology.txt`
- `reference-design.docx`

アーカイブ内部の保存先は、既存の`.clmproj`契約に従い、主対象を`target/TARGET.docx`、参考資料を`references/REF-001.pdf`から`references/REF-004.docx`とする。

## 生成アーキテクチャ

`samples/tools/build_sample_projects.mjs`を追加し、生成処理を一元化する。スクリプトは固定されたプロジェクト定義と既存サンプル原本から文書descriptorを構築し、コンパイル済みの実製品`ProjectStore`と`DocumentRegistry`を使用して保存する。

保存形式やmanifest生成をサンプル専用に再実装しない。これにより、サンプルはGUI保存物と同じ検証、token除去、文書埋め込み、SHA-256、原子的置換、安全なアーカイブパスの処理を通る。

package scriptは次の二つを提供する。

- `samples:projects:write`: Mainプロセスをビルドして2本を再生成する。
- `samples:projects:check`: 一時ディレクトリへ2本を再生成し、コミット済みファイルとバイト単位で一致することを確認する。

既存のZIP writerはエントリ順とZIP日時を固定している。プロジェクトID、日時、入力順も本設計で固定するため、原本が同じなら生成物は同一バイト列になる。

## サンプルカタログ契約

2本の`.clmproj`をサンプルカタログの正式な資産として扱う。

- ファイル用途へ`project_file`を追加する。
- 拡張子`.clmproj`のmedia typeを`application/vnd.checklistmaker.project+zip`とする。
- `entryPoints.existing_document.projectPath`へ既存文書用プロジェクトを登録する。
- `entryPoints.document_generation.projectPath`へ文書生成用プロジェクトを登録する。
- `sample-manifest.json`へ各ファイルのSHA-256とサイズを記録する。
- カタログ検証は`projectPath`が存在し、`project_file`用途で登録されていることを要求する。

## GUIでの利用フロー

クイックデモは次の流れとする。

1. CheckListMakerを起動する。
2. `プロジェクトを開く`から目的の`.clmproj`を選択する。
3. モード、主対象または生成設定、参考資料4件、5項目、9条件を確認する。
4. `事前検査`を実行し、エラー0件・警告0件を確認する。
5. `名前を付けて保存`で作業コピーを作成する。
6. 必要な項目だけ編集する。
7. `Copilot用ZIPを作成`を実行する。

サンプル原本を誤って上書きしないよう、手順書は編集前の`名前を付けて保存`を必須手順として明記する。既存の詳細入力手順は、手動再構築とGUI項目確認のため後半に残す。

## 安全性とエラー処理

- `.clmproj`は暗号化されず、主対象と参考資料の実体を含むことを明記する。
- プロジェクトJSONには絶対パス、作成PC固有のパス、live tokenを保存しない。
- 原本ファイルが不足している、形式が非対応、保存時のhashまたはsizeが一致しない場合は生成を失敗させる。
- 完成したプロジェクトが構造検証または事前検査に失敗する場合は生成を失敗させる。
- `--check`で再生成結果が一致しない場合は非ゼロ終了し、未更新または意図しないバイナリ差分を検出する。
- 一時生成物とGUI検証時の作業コピーはTEMP配下へ置き、リポジトリへ残さない。

## テスト設計

### TDD対象

実装前に、次を要求する失敗テストを追加する。

- サンプルカタログが`.clmproj`のmedia typeと`project_file`用途を受理する。
- 各モードの`projectPath`が必須で、登録済みプロジェクトを参照する。
- 2本のコミット済みプロジェクトが存在し、実製品`ProjectStore`で開ける。
- 開いたプロジェクトのモード、固定ID、文書、参考資料、ロール、項目、条件、スコープが期待値と一致する。
- `validateProject`が両プロジェクトに対して空配列を返す。
- 保存済みJSONのtokenが空で、絶対パスを含まない。
- `samples:projects:check`がコミット済み生成物との一致を確認する。

### 自動ゲート

- `npm.cmd run typecheck`
- `npm.cmd test`
- `npm.cmd run verify:samples`
- `npm.cmd run samples:projects:check`
- `npm.cmd run build`
- `git diff --check`

### 実Electron受入

production buildのElectronで2本を個別に開き、次を確認する。

- 期待するモードとプロジェクト名が表示される。
- 既存文書用では主対象が復元される。
- 文書生成用では完成済み生成設定が復元される。
- 参考資料4件、ロール1件、チェック項目5件、条件9件が復元される。
- 事前検査がエラー0件・警告0件になる。
- `名前を付けて保存`した作業コピーを再度開ける。
- dirty状態の保存を経てCopilot用ZIPを出力できる。
- GUI検証の作業コピー、ZIP、profile、logをcleanupできる。

## 文書更新

次を更新する。

- `samples/README.md`
- `samples/ja-machine-control-design-review/README.md`
- `docs/user-guide/samples-gui-demo.md`
- `docs/user-guide/samples-gui-demo.docx`

Markdown／Word手順書の先頭へ「5分クイックデモ」を追加する。既存の全項目入力手順は削除せず、ID採番、入力値、手動再構築の参照として維持する。Word版はMarkdownと内容を同期し、全ページを画像化して欠け、重なり、表崩れがないことを目視確認する。

## 非対象

- GUIへの`サンプルを開く`専用ボタン追加
- `.clmcheck`サンプルの追加
- 実行済み`result.json`の追加
- `.clmproj`形式そのものの変更
- サンプル原本の暗号化
- 自動Copilot実行または結果再インポート

## 完了条件

- 2本の自己完結型`.clmproj`が再生成可能な形で収録されている。
- GUIから手入力なしで両モードのフルサンプルを開始できる。
- 両プロジェクトの事前検査がエラー0件・警告0件である。
- カタログ、manifest、生成物、Markdown、Word手順書が同じ内容を示す。
- 全自動ゲートと実Electron受入が成功する。
