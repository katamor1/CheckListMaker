# Electron版 日本語UI文言 設計承認記録

- 承認日: 2026-07-16
- 対象仕様: `docs/superpowers/specs/2026-07-16-electron-japanese-ui-copy-design.md`
- 対象リポジトリ: `katamor1/CheckListMaker`
- 対象ブランチ: `agent/japanese-ui-copy`
- 状態: 承認済み

## 承認内容

Electron版CheckListMakerの利用者向け文言について、次の設計方針を承認する。

- 正確さを優先した専門的な日本語を使用する
- 利用者向け英語見出しを日本語化する
- React画面とElectron Main Processの利用者向け文言を対象とする
- 事前検査コードは通常非表示とし、詳細表示時だけ開示する
- 操作名は簡潔にし、通知・説明・警告・エラーは丁寧語で統一する
- 定着した技術用語は無理に日本語へ置き換えない
- 共通文言を`src/shared/presentation/ja/`へ集約する
- OS、Node.js、Electron、ZIP処理由来の生の例外文を通常画面へ表示しない
- JSON、`.clmproj`、`.clmcheck`、Copilot用ZIPの互換性を変更しない
- Copilot実行ZIP内の文章、Pythonバリデータ、サンプル文書本文は変更しない

## 実装計画

実装は`docs/superpowers/plans/2026-07-16-electron-japanese-ui-copy.md`に従い、テスト駆動でタスク単位に進める。
