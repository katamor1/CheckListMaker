# Electron GUIサンプル／操作手順書改訂 設計

- 状態: 実装用
- 作成日: 2026-07-16
- 対象: `katamor1/CheckListMaker` の `main`
- 対象UI: Electron / React版 CheckListMaker 0.1.0

## 目的

既存の設備状態監視デモと操作手順書を、`main`に実装済みの「概要・文書」「参考資料」「チェックリスト」タブ、参考資料ロール、9条件、4スコープへ一致させる。

## 採用方針

サンプル資産、説明用期待結果、Markdown手順書、Word手順書を同じ設定値から同期する。完成済み`.clmproj`は同梱せず、GUIのID自動採番と編集操作を利用者が確認できるデモを維持する。

## 改訂対象

- `samples/ja-machine-control-design-review/README.md`
- `samples/ja-machine-control-design-review/generation/document-request.json`
- `samples/ja-machine-control-design-review/existing-document/expected-outcomes.json`
- `samples/ja-machine-control-design-review/sample-manifest.json`
- `tests/sample_catalog/test_sample_content.py`
- `docs/user-guide/samples-gui-demo.md`
- `docs/user-guide/samples-gui-demo.docx`

## 契約

- 条件IDは現行Electron契約の`COND-01`から`COND-09`を使用する。
- 文書生成命令のプロパティは`instructions`を使用する。
- `expected-outcomes.json`はAI入力でも実行結果でもなく、正式な`result.json`はCopilot実行時に生成される。
- 参考資料は`REF-001`から`REF-004`の順になるよう1件ずつ登録する。
- チェック項目と条件を所定の順で追加し、削除済みIDを再利用しない現行GUIの挙動を手順へ明記する。

## 品質確認

- JSONはUTF-8、LF、2スペースインデント、末尾改行1件とする。
- 更新したサンプルファイルのSHA-256とサイズをmanifestへ反映する。
- Word版はMarkdownと同じ内容を持ち、DOCXを全ページ画像化して目視確認する。
