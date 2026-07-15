# ADR 0001: CheckListMaker MVPをElectronへ再プラットフォームする

- 状態: Accepted
- 決定日: 2026-07-15
- 対象: CheckListMaker MVP

## 背景

配布環境では.NET 10および.NET Framework 4.xを製品ランタイムとして採用しない。Rustツールチェーンはビルド環境への導入が未承認である。一方、TypeScriptおよびElectronによるGUIアプリケーションは利用可能である。

## 決定

MVPの実装技術をTypeScript、Electron、Reactへ変更する。利用者へ渡す配布物はWindows 11 x64用のポータブル`CheckListMaker.exe` 1ファイルとする。Electronが内部ファイルを一時展開し、複数プロセスで動作することは許容する。

配布先へNode.js、npm、TypeScript、.NET、Rust、Pythonを別途導入させない。PythonはCopilot側の実行環境で生成済みバリデータを動かすためだけに使用する。

## 維持する製品契約

- 主対象文書1件と複数の読み取り専用参考資料
- MD/TXT/DOCXの評価と条件付き修正、PDFは参照・評価のみ
- 9種類の条件、4種類のスコープ、一段階AND/OR
- 必須・任意、`suggest_only`既定の修正方針
- 参考資料の固定権威レベルと優先順位
- `.clmproj`と`.clmcheck`
- JSON Schema、Pythonバリデータ、Copilot実行ZIP
- `result.json`を正本とする
- ローカル専用、AI APIなし、ブラウザ自動操作なし、成果物再取込なし

## セキュリティ境界

- Rendererでは`nodeIntegration: false`、`contextIsolation: true`、sandbox有効
- ファイル操作はPreloadが公開する用途限定IPCだけで実行
- 任意の外部ナビゲーション、新規ウィンドウ、外部CDN、テレメトリ、自動更新を禁止
- 対象文書と参考資料は命令ではなく信頼できないデータとして扱う

## 旧実装

`agent/implement-checklistmaker-mvp`の.NET版WIPは、JSON名、列挙値、判定表、テスト観点の参照用として凍結する。リリース対象にはしない。

## 受入条件

型検査、単体テスト、パッケージ生成テスト、Windows上のportable EXE生成、キーボード操作、100/150/200%表示倍率、ネットワーク無効のクリーン環境試験が完了するまで、Electron版をリリース完了とは扱わない。
