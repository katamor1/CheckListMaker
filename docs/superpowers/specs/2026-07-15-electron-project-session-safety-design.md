# Electronプロジェクトセッション安全化 設計

## 1. 状態

- 日付: 2026-07-15
- 対象: Electron版CheckListMaker
- 承認済み方針: 完全修正
- 対象ブランチ: `agent/replatform-electron`

## 2. 背景

現在のElectron版は、編集中の`ProjectDefinition`と`dirty`をRendererのReact stateに保持する一方、文書実体を解決する`DocumentRegistry`、保存先、テンプレート状態をMain Processのグローバル変数に保持している。この分割により、次の不整合が発生する。

1. 未保存の状態で新規モードへ切り替えると、確認なしで現在のProjectとMain側registryが破棄される。
2. 別プロジェクトの読込では、候補ファイルの検証完了前に現在のregistryが消去される。候補が破損している場合、Rendererは旧Projectを表示し続けるが、文書tokenを解決できなくなる。
3. ウィンドウ終了時にdirty stateを確認する経路がない。
4. dirtyなProjectでも保存前にZIP生成を開始でき、既存設計の「未保存変更を先に保存する」契約を満たさない。
5. Mainが投げた業務エラーを`ipcRenderer.invoke()`がtransportエラーへ変換し、Rendererが`Error invoking remote method ...`を通常画面へ表示する。

文書生成設定フォームは、現行HEAD `d7f5012`までのコミットで既に追加されている。本設計では再実装せず、Main Processとの統合と回帰検証のみを対象とする。

## 3. 目標

- Main ProcessにProjectセッションの正本を一つだけ置く。
- 新規作成、別プロジェクト読込、ウィンドウ終了を共通の未保存ガードで保護する。
- 候補プロジェクトの読込失敗が現在のセッションへ影響しないようにする。
- 保存取消、保存失敗、読込失敗では現在のProject、path、registry、dirty stateを完全に維持する。
- dirtyなProjectのZIP生成前に保存を完了させる。
- 期待される業務エラーと想定外エラーをIPC境界で区別し、生のElectron transport文言やstackをRendererへ渡さない。
- 新しい依存関係を追加せず、Vitest、TypeScript、実Electronで検証可能にする。

## 4. 非目標

- `.clmproj`またはCopilot ZIPのファイル形式変更
- 自動保存、クラッシュ復旧、履歴管理の追加
- チェックリスト、参考資料、テンプレート編集UIの完成
- 文書生成モデルへの新フィールド追加
- dirty判定をsemantic fingerprint比較へ変更すること
- Renderer全体の再設計

本修正では、現在と同じく意味のある編集操作が一度でも行われればdirtyとし、保存成功またはプロジェクト読込成功でcleanに戻す。

## 5. アーキテクチャ

### 5.1 ProjectSessionManager

`src/main/project-session.ts`にElectron UIから独立した`ProjectSessionManager`を追加する。Managerは現在のセッションを一つだけ所有する。

```ts
interface ProjectSessionContext {
  project: ProjectDefinition;
  path?: string;
  template?: ChecklistTemplateDefinition;
  dirty: boolean;
  revision: number;
  registry: DocumentRegistry;
  store: ProjectStore;
  packageGenerator: CopilotPackageGenerator;
}

interface SessionSnapshot extends ProjectSummary {
  revision: number;
}
```

`DocumentRegistry`、`ProjectStore`、`CopilotPackageGenerator`は常に同じcontextへ束ねる。Main Processの既存グローバル`registry`、`store`、`packageGenerator`、`currentProjectPath`、`currentTemplate`はManagerへ移す。`allowedOutputPaths`はアプリケーション単位の許可リストなのでManager外に残す。

Managerは次の操作を提供する。

- `currentSummary()`
- `updateDraft(project, revision)`
- `createCandidate(mode)`
- `loadCandidate(path)`
- `replaceCurrent(candidate, decision)`
- `saveCurrent(saveAs)`
- `ensureSavedBeforeExport()`
- `exportCurrent(destination)`

### 5.2 Rendererからのdraft同期

RendererのProject更新を一つのhelperへ集約し、React state更新とMainへのdraft同期を同じ箇所で行う。

- 各更新には単調増加する`revision`を付ける。
- Mainは`projectId`が現在セッションと一致し、現在revisionより新しい更新だけを受理する。置換前のRenderer更新が遅れて到着しても、新しいセッションへ混入させない。
- Rendererは未完了の同期Promiseを保持する。
- 新規作成、読込、保存、エクスポート、終了確認の前に未完了同期をflushする。
- Mainからの新規作成、読込、保存結果は`SessionSnapshot`として返し、Renderer stateを置換するときに返されたrevisionを新しい基準値にする。

これにより、入力直後に別操作や終了を行ってもMainのセッションは最新のProjectを使用する。Project全体をIPCで同期するが、ローカルIPCのみであり、外部通信は発生しない。

### 5.3 候補セッションの原子的交換

新規作成と読込は、現在のcontextを直接変更せず、独立した候補contextを作る。

新規作成:

1. 新しいregistry、store、package generatorと既定Projectで候補contextを作る。
2. 現在のセッションに未保存変更があれば共通ガードを実行する。
3. ガードが続行を返した場合だけ候補contextを現在contextへ設定する。

プロジェクト読込:

1. OSのファイル選択を表示する。取消時は現在セッションを変更しない。
2. 新しいregistryとstoreを使って候補ファイルを完全に読込・検証する。
3. 読込失敗時は候補contextだけを破棄し、現在セッションを変更しない。
4. 読込成功後に未保存ガードを実行する。
5. 続行が承認された場合だけ候補contextを原子的に現在contextへ設定する。

候補Projectが現在contextへ設定される前に、現在registryを`clear()`してはならない。

ここでいう候補ファイルの検証は、archive構造、必須entry、形式version、hash、文書token復元など、セッションを安全に構築できることの検証を指す。`validateProject()`が返す事前検査エラーは読込を拒否する条件にしない。利用者が不完全なProjectを開いて修正できるよう、読込後に通常の事前検査結果として表示する。

## 6. 未保存変更ガード

### 6.1 共通選択肢

dirtyなセッションを置換または終了するときは、Main Processの`dialog.showMessageBox()`で次の3択を表示する。

1. `保存して続行`
2. `保存せずに続行`
3. `キャンセル`

`キャンセル`を`defaultId`および`cancelId`に設定する。Escapeとダイアログを閉じる操作はキャンセルとして扱う。

### 6.2 遷移規則

| 状態・選択 | 結果 |
|---|---|
| clean | 確認せず続行 |
| dirty + 保存して続行 | 保存成功後だけ続行 |
| dirty + 保存せずに続行 | 保存せず続行 |
| dirty + キャンセル | 現在セッションを維持 |
| 保存先選択を取消 | 現在セッションを維持 |
| 検証エラーまたはI/O失敗 | エラーを表示し、現在セッションを維持 |

保存のために新しい保存先が必要な場合は`.clmproj`保存ダイアログを表示する。現在の保存規則どおり、事前検査エラーがあるProjectは保存できない。この場合、置換または終了を続行しない。

### 6.3 適用箇所

- 既存文書モードの新規作成
- 文書生成モードの新規作成
- 別プロジェクトを開く
- BrowserWindowを閉じる
- アプリケーション終了

ウィンドウ終了ではMain Processの`close`イベントを一度`preventDefault()`する。Mainは一意なrequest IDを付けてRendererへ`session:flush-before-close`を通知する。Preloadが公開する購読APIを通じてRendererが未完了draft同期をflushし、同じrequest IDで`session:close-ready`を返した後に共通ガードを実行する。続行時だけ再入防止フラグを立ててウィンドウを閉じる。ガード実行中の重複close要求は無視する。

Rendererからclose-readyが返らない場合は無条件終了しない。5秒で待機を終了し、Mainのネイティブダイアログで「最新の編集内容を確認できないため終了を中止した」ことを通知してウィンドウを維持する。

## 7. dirtyなProjectのエクスポート

エクスポートは次の順で処理する。

1. Rendererの最新draft同期をflushする。
2. セッションがdirtyなら通常保存を実行する。
3. 保存取消または保存失敗なら、エクスポートを取消として終了する。
4. 保存成功後のProjectに対して事前検査を実行する。
5. エラーが0件の場合だけZIP保存先を選択して生成する。

エクスポートでは「保存せずに続行」を提供しない。ZIPは必ず保存済みProjectから生成する。

## 8. IPCエラー契約

### 8.1 型付き結果

MainのIPC handlerは、利用者が対処できる期待済みエラーについて、生の例外rejectを通常経路にしない。共通のdiscriminated unionを返す。

```ts
type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };
```

- 検証エラー、利用者が選んだファイルの不備、保存失敗などは`ok: false`で返す。
- 取消は既存resultの`canceled: true`を維持し、エラー扱いしない。
- 想定外例外はMain側へ記録し、Rendererへは`処理に失敗しました。再度お試しください。`を返す。

### 8.2 Preload wrapper

Preloadに共通`invoke()` wrapperを置き、`IpcResult<T>`をunwrapする。

- `ok: true`は`value`を返す。
- `ok: false`はMainが返した利用者向けmessageだけを持つ新しい`Error`をRenderer内で生成する。
- Electron transport自体がrejectした場合は、`Error invoking remote method ...`を表示せず一般エラーへ変換する。

Rendererの`execute()`は引き続き`Error.message`をstatusへ表示できるが、そのmessageは既に安全な利用者向け文言だけになる。

## 9. 文書生成フォーム

現行の`GenerationSettingsForm`と`applyGenerationPatch`を維持する。次を回帰確認する。

- 全生成設定が編集可能である。
- 一項目の変更で他項目を失わない。
- 文書生成指示を入力すると`GENERATION_INSTRUCTIONS_REQUIRED`が解消する。
- 入力変更でProjectがdirtyになり、Mainのdraftへ同期される。
- 保存後はcleanになる。

文書生成モデルやvalidation ruleの追加変更は本修正に含めない。

## 10. テスト戦略

実装はTDDで行い、各production変更の前に対応する失敗テストを確認する。

### 10.1 Unit tests

`tests/project-session.test.ts`:

- cleanセッションは確認なしで交換できる。
- dirty + 保存成功で交換できる。
- dirty + 保存せず続行で交換できる。
- dirty + キャンセルで現在contextを維持する。
- 保存取消、検証失敗、I/O失敗で現在contextを維持する。
- 候補読込失敗で現在Project、path、registryを維持する。
- 古いrevisionのdraft更新を無視する。
- 保存成功でdirtyを解除する。
- dirtyエクスポートは保存成功後だけ生成する。

`tests/ipc-result.test.ts`:

- 成功resultをunwrapできる。
- 期待済みエラーは利用者向けmessageだけになる。
- Electron transport rejectは一般エラーになる。
- stack、channel名、`Error invoking remote method`を返さない。

`tests/generation-settings-form.test.ts`:

- 既存のフォーム表示・patch保持テストを維持する。
- 生成指示更新後のProjectが事前検査を通過することを追加する。

### 10.2 Main integration tests

Electron dialogを直接呼ばないadapter境界を作り、選択結果と保存結果を注入して次を確認する。

- new/open/closeが同じガード規則を使う。
- open候補は読込成功まで現在contextと分離される。
- closeガードの再入を防止する。

### 10.3 GUI verification

実Electronのproduction Rendererで次を確認する。

- 文書生成指示を入力して事前検査が0件になる。
- dirty状態でモード切替すると未保存確認が表示される。
- キャンセルで入力値と現在モードが維持される。
- 無効な保存・エクスポートでElectron transport文言が表示されない。
- desktopと狭幅表示でフォーム、確認後の画面、statusに欠けや重なりがない。
- console/runtime errorがない。

OSネイティブ確認ダイアログの各ボタンはComputer Useが利用可能なら実操作し、利用できない場合はadapter integration testとMainの状態遷移テストを証跡とする。

## 11. 検証ゲート

完了前に次をすべて実行する。

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

加えて、実Electron GUIスモーク、`git diff --check`、テスト用process/listenerの停止を確認する。

## 12. 完了条件

- 未保存Projectを確認なしで置換・終了できない。
- 保存、破棄、キャンセルの各結果が新規作成、読込、終了で一貫する。
- 破損候補または読込失敗後も現在Projectを保存・エクスポートできる。
- dirtyなProjectから直接ZIPを生成できない。
- 通常画面にElectron channel名、transport prefix、stackが表示されない。
- 現行文書生成フォームが実Electron上で事前検査合格へ到達できる。
- 自動テスト、型検査、build、GUIスモークがすべて成功する。
