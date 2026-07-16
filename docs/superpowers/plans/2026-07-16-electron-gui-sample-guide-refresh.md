# Electron GUIサンプル／操作手順書改訂 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 最新の`main` Electron GUIで設備状態監視デモを再現できるサンプル説明とMarkdown／Word手順書を作る。

**Architecture:** サンプルの設定値を現行TypeScriptモデルへ合わせ、README、期待結果、手順書から同じID・名称・優先順位を参照する。バイナリ文書は変更せず、変更したテキスト資産だけmanifestのハッシュとサイズを更新する。

**Tech Stack:** Markdown、JSON、Python 3、python-docx、CheckListMaker sample validator。

## Global Constraints

- 対象ブランチは`main`。
- `.clmproj`と`.clmcheck`はサンプルカタログへ登録しない。
- 条件IDは`COND-01`～`COND-09`。
- 参考資料IDは`REF-001`～`REF-004`。
- DOCXはレンダリング後に全ページを目視確認する。

---

### Task 1: サンプル契約の更新

**Files:**
- Modify: `samples/ja-machine-control-design-review/README.md`
- Modify: `samples/ja-machine-control-design-review/generation/document-request.json`
- Modify: `samples/ja-machine-control-design-review/existing-document/expected-outcomes.json`
- Modify: `tests/sample_catalog/test_sample_content.py`

**Interfaces:**
- Produces current GUI field names, `COND-##` IDs, and runtime-generated result disclosure.

- [ ] `instructions`と`COND-01`～`COND-09`を期待するテストへ更新する。
- [ ] サンプルREADME、生成設定、期待結果を更新する。
- [ ] `python -m unittest tests.sample_catalog.test_sample_content -v`を実行する。

### Task 2: manifest整合性の更新

**Files:**
- Modify: `samples/ja-machine-control-design-review/sample-manifest.json`

**Interfaces:**
- Consumes the changed sample files from Task 1.
- Produces matching SHA-256 and byte sizes.

- [ ] 変更ファイルのSHA-256とサイズを再計算する。
- [ ] `python samples/validate_samples.py --root .`を実行し、`OK samples=1 files=8`を確認する。

### Task 3: 操作手順書の改訂

**Files:**
- Modify: `docs/user-guide/samples-gui-demo.md`
- Modify: `docs/user-guide/samples-gui-demo.docx`

**Interfaces:**
- Produces exact click order, entry values, ID allocation, preflight, export, and Copilot execution steps.

- [ ] Markdownを最新タブと入力ラベルへ更新する。
- [ ] Markdownと同じ内容のWord版を生成する。
- [ ] `render_docx.py`で全ページをPNG化し、欠け、重なり、表崩れがないことを確認する。

### Task 4: 最終検証

**Files:**
- Verify all changed files.

**Interfaces:**
- Produces a reviewable documentation-only change set.

- [ ] サンプルテスト、カタログ検証、JSON整形検査を実行する。
- [ ] MarkdownとWordの章、ID、入力値が一致することを確認する。
- [ ] 変更を`docs: refresh Electron GUI sample guide`としてコミットする。
