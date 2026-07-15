# デモサンプルカタログ

このディレクトリは、CheckListMaker の既存文書レビューと文書生成を説明するためのデモサンプルを収録します。各サンプルは `catalog.json` から `sample-manifest.json` を参照し、manifest に記録されたファイルのパス、サイズ、SHA-256、メディア種別、参考資料の権威レベル、モード別の入口を検証できる構成です。

カタログ登録後の検証には `samples/validate_samples.py` を使用します。リポジトリルートで次を実行してください。

```text
python3 samples/validate_samples.py --root .
```

検証はカタログと manifest の構造、相互参照、ファイルの完全性を確認します。文書本文の意味的な正しさを判定するものではありません。

このカタログには、編集可能なプロジェクトまたはチェックリストの保存物である `.clmproj` と `.clmcheck` を登録しません。また、`result.json` を含む実行後の結果ファイルも登録しません。
