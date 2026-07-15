# CheckListMaker samples GUIデモ利用手順書

- 対象実装: Electron / React 開発版
- 対象ブランチ: `agent/replatform-electron`
- 対象環境: Windows 11 x64
- 文書版: 0.1
- 作成日: 2026-07-15

> **重要**  
> 現行GUIには、`samples`カタログの一括読込、参考資料の登録・優先順位設定、チェックリスト編集、9条件フォームがまだありません。したがって、現時点ではフルサンプルをGUIだけで再現できません。本書は「現行GUIで実行できるスモークデモ」と「完成GUI向けのフル設定手順」を分けて記載します。

## 0. この手順書の使い方

- **現行GUIスモークデモ**: 主対象または生成指示の入力、保存、事前検査、Copilot用ZIP作成を確認します。
- **フルサンプルデモ**: 参考資料・チェックリスト画面の実装完了後、4参考資料、5チェック項目、9条件を設定します。

## 1. デモサンプルの概要

サンプルIDは `ja-machine-control-design-review`、表示名は「設備状態監視機能 基本設計レビュー」です。架空の機械制御ソフトウェアを題材に、次の2モードを確認します。

| モード | 入口 |
|---|---|
| 既存文書レビュー | `samples\ja-machine-control-design-review\existing-document\target\basic-design-before-review.docx` |
| 文書生成 | `samples\ja-machine-control-design-review\generation\document-request.json` |

`expected-outcomes.json`は説明用の非権威データで、AI入力ではありません。`samples`には`.clmproj`と`.clmcheck`も含まれません。

## 2. 事前準備と起動

必要環境はWindows 11 x64、Node.js 22以上、npm 10以上推奨、Gitです。

```powershell
git clone https://github.com/katamor1/CheckListMaker.git
cd CheckListMaker
git checkout agent/replatform-electron
npm install
npm run dev
```

ポータブルEXEを作る場合:

```powershell
npm run dist:portable
.\artifacts\portable\CheckListMaker.exe
```

PR #2はドラフトです。現在のEXEは開発・受入試験用です。

## 3. 現行GUIの画面構成

- 上部: 「既存文書を検証」「文書を生成して検証」「プロジェクトを開く」
- プロジェクトパネル: プロジェクト名、保存状態、チェック項目数、参考資料数、既定修正方針
- 既存文書モード: 「文書を選択」
- 文書生成モード: タイトル、読者、目的、言語、形式、指示、2つの制約
- アクション: 保存、名前を付けて保存、事前検査、Copilot用ZIPを作成
- 右側: 事前検査結果
- フッター: 状態通知、「生成したZIPを表示」

## 4. 現行GUI: 既存文書レビュー

1. CheckListMakerを起動します。
2. 「既存文書を検証」をクリックします。
3. プロジェクト名を「設備状態監視機能 基本設計レビュー（既存文書）」へ変更します。
4. 「文書を選択」をクリックします。
5. `samples\ja-machine-control-design-review\existing-document\target\basic-design-before-review.docx`を選択します。
6. 主対象文書名が`basic-design-before-review.docx`になったことを確認します。
7. 概要が「チェック項目 1」「参考資料 0」「既定修正方針 suggest_only」であることを確認します。
8. 「事前検査」をクリックします。通常はエラー0、警告0です。
9. 「名前を付けて保存」で`設備状態監視機能_既存文書デモ.clmproj`を保存します。
10. 「Copilot用ZIPを作成」でZIPを保存します。
11. 「生成したZIPを表示」で出力場所を開きます。

この操作は主対象・保存・ZIP出力のスモークテストです。`expected-outcomes.json`の9条件は再現しません。

## 5. 現行GUI: 文書生成

1. 「文書を生成して検証」をクリックします。
2. 次の値を入力します。

| GUI項目 | 入力値 |
|---|---|
| プロジェクト名 | 設備状態監視機能 基本設計レビュー（文書生成） |
| 文書タイトル | 設備状態監視機能 基本設計書 |
| 想定読者 | 制御ソフトウェア設計者および品質保証担当者 |
| 文書の目的 | 承認レビュー用の基本設計書初稿を作成する |
| 言語 | ja |
| 生成形式 | Word (.docx) |
| 文書生成指示 | 参考資料を事実根拠として使用し、根拠のない値を創作せず、「1. 目的」「2. 適用範囲」「3. 構成」「4. 機能設計」「5. 異常凧理」「6. スケジュール」「7. 承認」の七つの必須セクションをこの順序で出力する。 |

3. 「参考資料を事実の根拠として使用する」と「参考資料にない事実を推測で補わない」をオンにします。
4. 「事前検査」を実行します。
5. `.clmproj`を保存し、Copilot用ZIPを作成します。

現行GUIでは参考資料を追加できないため、これは生成設定のスモークテストです。

## 6. フルサンプルをGUIで構成する

### 6.1 参考資料

| ID | ファイル | 表示名／用途 | 権威 | 優先度 |
|---|---|---|---|---:|
| REF-001 | `quality-assurance-policy.pdf` | 品質保証規程（デモ）／必須品質規則と禁止事項 | binding | 100 |
| REF-002 | `basic-design-template.md` | 基本設計テンプレート／必須章、記載項目、順序 | approved | 80 |
| REF-003 | `control-terminology.txt` | 制御用語集／用語と表記の統一 | working | 60 |
| REF-004 | `reference-design.docx` | 設備状態監視機能 参考設計書／上位資料と矛盾しない記述例 | reference | 40 |

必要参考資料ロールは`ROLE-001`、名称「品質基準」、必須、推奨権威レベル`approved`です。REF-001とREF-002を割り当てます。

### 6.2 チェックリスト

- 名称: 基本設計レビュー完全チェックリスト
- 既定修正方針: `suggest_only`
- 5チェック項目、9条件

#### 項目1: 目的と適用範囲

- 必須、AND、既定方針継承
- COND-0001: semantic／文書全体／「目的が具体的で検証可能であること」
- COND-0002: required_text／章「2. 適用範囲」／値「対象」「除外」／両方必要

#### 項目2: 曖昧表現と主要パラメータ

- 必須、OR、`auto_fix`
- COND-0003: forbidden_text／「適切に」「必要に応じて」
- COND-0004: number／表「主要パラメータ」／監視周期 <= 250 ms

#### 項目3: 承認とスケジュール

- 必須、AND、`do_not_modify`
- COND-0005: length_or_count／表「承認情報」／「未定」の出現回数 <= 0
- COND-0006: date_or_deadline／改訂日 >= 2026-07-01

#### 項目4: 文書情報

- 必須、OR、`suggest_only`
- COND-0007: pattern／`^DMS-[0-9]{4}$`
- COND-0008: one_of／機密区分=公開、社内、機密

#### 項目5: 参考資料整合性

- 任意、対象外可、AND、`auto_fix`
- COND-0009: cross_source_consistency／「監視周期と用語定義」／REF-001〜REF-004を照合

> サンプル期待値は`COND-0001`形式ですが、現行Electron検証コードは`COND-01`形式を要求します。GUI自動採番IDを使用し、意味を対応付けてください。

## 7. Copilotで実行する

1. 生成したZIPをPython実行機能のあるブラウザ版Copilotへアップロードします。
2. ZIP内の`01_EXECUTION_PROMPT.md`の内容を送信します。
3. Copilotが最初に`python validate_output.py --self-test`を実行したことを確認します。
4. 評価、修正、再評価、構造検証を完了させます。
5. `outputs/result.json`と関連成果物をダウンロードします。
6. `result.json`を結果の正本として扱います。

## 8. 期待結果

| ID | 想定 |
|---|---|
| COND-0001 | valid |
| COND-0002 | invalid。除外の追記案のみ |
| COND-0003 | invalid。曖昧語を検出 |
| COND-0004 | invalid。500msは250ms上限超過 |
| COND-0005 | needs_information。承認者を推測しない |
| COND-0006 | invalid。改訂日が基準日前 |
| COND-0007 | valid |
| COND-0008 | valid |
| COND-0009 | invalid。任意項目なので警告表示 |

REF-001の`binding`要求「250ms以下」を、REF-004の`reference`記述「500ms」より優先します。

## 9. トラブルシューティング

| 症状 | 対処 |
|---|---|
| 主対象文書がありません | 「文書を選択」から対象を選ぶ |
| 文書生成指示が空です | 第5章の指示文を貼り付ける |
| 保存／ZIP作成ができない | 事前検査のerrorを解消する |
| 参考資料を追加できない | 現行GUI未実装。第6章は完成GUI向け |
| チェックリストを編集できない | 現行GUI未実装。既定1項目でスモークテストのみ実施 |
| Copilot結果が期待と違う | ZIP内の`checklist.json`、`references/`、`manifest.json`を確認する |

## 10. 受入チェックリスト

- [ ] アプリを起動できる
- [ ] 2モードを新規作成できる
- [ ] 主対象DOCXを選択できる
- [ ] 文書生成設定を入力できる
- [ ] 事前検査結果を表示できる
- [ ] `.clmproj`を保存・再読込できる
- [ ] Copilot用ZIPを作成できる
- [ ] フルGUIでは4参考資料と9条件を設定できる
- [ ] `expected-outcomes.json`をAI入力に含めていない
- [ ] `result.json`でREF-001がREF-004より優先されている

## 根拠資料

- PR #2: `Replatform CheckListMaker MVP to Electron`（作成時参照）
- `README.md`
- `src/renderer/App.tsx`
- `src/renderer/GenerationSettingsForm.tsx`
- `src/shared/defaults.ts`
- `src/shared/validation.ts`
- `samples/catalog.json`
- `samples/ja-machine-control-design-review/sample-manifest.json`
- `samples/ja-machine-control-design-review/existing-document/expected-outcomes.json`
- 旧実装ブランチ `tests/CheckListMaker.Domain.Tests/Fixtures/complete-project.json`
