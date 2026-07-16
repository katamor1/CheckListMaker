# デモサンプルカタログ

このディレクトリは、CheckListMaker の既存文書レビューと文書生成を説明するためのデモサンプルを収録します。各サンプルは `catalog.json` から `sample-manifest.json` を参照し、manifest に記録されたファイルのパス、サイズ、SHA-256、メディア種別、参考資料の権威レベル、モード別の入口を検証できる構成です。

カタログ登録後の検証には `samples/validate_samples.py` を使用します。リポジトリルートで次を実行してください。

```text
python3 samples/validate_samples.py --root .
```

検証はカタログと manifest の構造、相互参照、ファイルの完全性を確認します。文書本文の意味的な正しさを判定するものではありません。

このカタログには、編集可能なプロジェクトのスターターとして `ja-machine-control-design-review/projects/existing-document-demo.clmproj` と `ja-machine-control-design-review/projects/document-generation-demo.clmproj` の2件を登録します。`.clmproj` は暗号化されません。主対象文書と参考資料の実体を含むため、コピーを作成してから編集してください。

チェックリスト単体の保存物である `.clmcheck` と、実行時に生成される `result.json` はカタログへ登録しません。
