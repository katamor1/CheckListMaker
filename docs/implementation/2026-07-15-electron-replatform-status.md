# CheckListMaker Electron移行ステータス

- 記録日: 2026-07-15
- 実装ブランチ: `agent/replatform-electron`
- 旧参照ブランチ: `agent/implement-checklistmaker-mvp`
- 採用技術: TypeScript / Electron / React
- 配布形式: Windows 11 x64 ポータブル `CheckListMaker.exe`
- 配布先の追加ランタイム: 不要
- 起動時の一時展開: 許容

## 維持する製品契約

チェックリスト、9条件、4スコープ、AND/OR、必須・任意、修正方針、参考資料優先順位、`.clmproj`、`.clmcheck`、Copilot実行ZIP、JSON Schema、Pythonバリデータ、`result.json`正本の各要件を維持する。

## Electron固有の境界

- Rendererの`nodeIntegration`は無効。
- `contextIsolation`とsandboxを有効化。
- ファイル操作はMain Processの用途限定IPCだけで行う。
- 外部画面、外部CDN、テレメトリ、自動更新、AI APIを使用しない。
- Node.js、npm、TypeScript、.NET、Rust、Pythonを配布先へ要求しない。

## 実装順

1. TypeScriptドメイン契約と互換fixture
2. 安全なZIPとプロジェクト／テンプレート保存
3. JSON Schema、Pythonバリデータ、Copilotパッケージ
4. Electron Main/Preload、IPC、事前検査とエクスポート
5. Reactのウィザード、自由編集、9条件フォーム
6. ポータブルEXE、Windows CI、受入試験

本ファイルはリモート保全のチェックポイントであり、CIと手動受入を通過する前にリリース完了を宣言しない。
