# CheckListMaker MVP 設計承認記録

- 承認日: 2026-07-14
- 対象仕様: `docs/superpowers/specs/2026-07-14-checklistmaker-mvp-design.md`
- 対象リポジトリ: `katamor1/CheckListMaker`
- 対象範囲: MVP / Package Format 1.0
- 状態: 承認済み

## 承認内容

会話で合意したCheckListMaker MVP設計を、実装計画へ移行可能な正式仕様として承認する。

主な承認済み境界は次のとおり。

- Windows 11 x64向けローカル専用・単一ユーザーアプリ
- インストール不要の自己完結型単体EXE
- .NET 10 / WPF / C# / MVVM
- ブラウザチャット型Copilotへの手動パッケージ受け渡し
- Copilot内Pythonによる出力JSON自己検証
- 主対象文書1件と複数の読み取り専用参考資料
- MD/TXT/DOCXの評価・条件付き修正、PDFの参照・評価のみ
- `.clmproj` と `.clmcheck` のローカル保存
- `result.json` を結果の正本とする
- Copilot成果物の再取り込み、AI API連携、ブラウザ自動操作はMVP対象外

## 次工程

実装は `docs/superpowers/plans/2026-07-14-checklistmaker-mvp-roadmap.md` と、同ディレクトリの6つの詳細実装計画に従って進める。
