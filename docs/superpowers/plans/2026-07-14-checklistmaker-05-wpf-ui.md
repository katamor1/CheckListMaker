# CheckListMaker WPF User Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Japanese Windows 11 WPF interface: home, guided wizard, free-edit workspace, checklist/template editors, preflight/export, recovery, and keyboard-accessible operation.

**Architecture:** `CheckListMaker.App` is a thin WPF/MVVM shell over Plan 4 use cases. View models replace immutable domain records and never read/write project ZIP or package JSON directly. Typed navigation and XAML `DataTemplate`s select pages and condition editors.

**Tech Stack:** .NET 10 WPF, C# 14, XAML, built-in dialogs/automation APIs, MSTest 4.3.2; no UI framework or MVVM package.

## Global Constraints

- Complete Plans 1–4 first.
- Japanese is the shipped UI language.
- Support 100%, 150%, and 200% display scaling without clipping.
- Primary workflows are keyboard-operable; state is never color-only.
- Labels expose access keys and `AutomationProperties.Name/HelpText`.
- Errors state what failed, impact, data safety, and next action.
- Normal users do not need to edit JSON, schema, Python, IDs, or regex; regex is advanced-only.
- Code-behind contains only initialization, focus restoration, and lifecycle forwarding.
- No network, AI call, browser automation, or runtime third-party package.

---

### Task 1: Build MVVM primitives and composition root

**Files:**
- Create: `src/CheckListMaker.App/Infrastructure/{ObservableObject,RelayCommand,AsyncRelayCommand,DialogService,ClipboardService,DispatcherTimerFactory,UiErrorPresenter}.cs`
- Create: `src/CheckListMaker.App/Composition/AppServices.cs`
- Modify: `App.xaml`, `App.xaml.cs`
- Test: `tests/CheckListMaker.App.Tests/Infrastructure/{ObservableObjectTests,CommandTests}.cs`

**Interfaces:** Produces dependency-injected view-model foundations without a service locator.

- [ ] **Step 1: Write failing property/command tests**

Assert property change only on changed value; sync command observes `CanExecute`; async command disables re-entry, exposes `IsRunning`, forwards cancellation, and routes errors to `UiErrorPresenter`.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter "FullyQualifiedName~ObservableObjectTests|FullyQualifiedName~CommandTests"
```

- [ ] **Step 3: Implement and manually compose services**

`AppServices.Create()` constructs clocks, stores, package generator, use cases, recent/recovery services, dialog service, and top-level view models. Do not expose a static resolver.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add WPF MVVM foundations"
```

### Task 2: Implement main window and typed navigation

**Files:**
- Create: `src/CheckListMaker.App/Navigation/{NavigationTarget,NavigationRequest,MainWindowViewModel}.cs`
- Modify: `MainWindow.xaml`, `MainWindow.xaml.cs`, `App.xaml`
- Test: `tests/CheckListMaker.App.Tests/Navigation/MainWindowViewModelTests.cs`

**Interfaces:** Produces navigation among Home, Wizard, Workspace, Template Editor, Preflight, and Recovery.

- [ ] **Step 1: Write navigation tests**

Test initial Home, forward navigation, back behavior, dirty-session close guard, selected workspace section, and focus token after navigation.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~MainWindowViewModelTests
```

- [ ] **Step 3: Implement typed content templates**

Bind `CurrentPage` to a `ContentControl`; map view-model types to views in `App.xaml`. Main window exposes `Ctrl+N`, `Ctrl+O`, `Ctrl+S`, `Ctrl+Shift+S`, `Ctrl+E`, and `Alt+Left` commands.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add typed WPF navigation"
```

### Task 3: Build home and recent-project actions

**Files:**
- Create: `src/CheckListMaker.App/Home/{HomeView.xaml,HomeViewModel.cs}`
- Test: `tests/CheckListMaker.App.Tests/Home/HomeViewModelTests.cs`

**Interfaces:** Starts new project/template flows, opens chosen/recent projects, removes missing entries, and clears history.

- [ ] **Step 1: Write home tests**

Assert recent order, open success navigation, missing project removal after confirmation, corrupt-open error, template editor action, and no document/reference metadata in displayed history.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~HomeViewModelTests
```

- [ ] **Step 3: Implement accessible home view**

Buttons: `_新しいプロジェクト`, `_プロジェクトを開く`, `_テンプレートを作成・編集`. Recent list exposes project base filename, directory, and last-opened time; Enter opens and Delete removes with confirmation.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add home and recent projects UI"
```

### Task 4: Implement the guided new-project wizard

**Files:**
- Create: `src/CheckListMaker.App/Wizard/NewProjectWizardView.xaml`
- Create: `NewProjectWizardViewModel`, `WizardStepViewModel`, and six step view models under `Wizard/Steps/`
- Test: `tests/CheckListMaker.App.Tests/Wizard/NewProjectWizardViewModelTests.cs`

**Interfaces:** Produces a validated `ProjectSession` and navigates to Workspace.

- [ ] **Step 1: Write wizard tests**

Cover existing/generation mode branching, supported file filters, reference metadata, new/imported checklist, required-role assignment, default `SuggestOnly`, back/next validation, review errors, cancel cleanup, and successful creation.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~NewProjectWizardViewModelTests
```

- [ ] **Step 3: Implement step navigation**

Steps: mode; target or generation; references; checklist; policy/roles; review. Each step exposes `Validate()` with field errors and focus target. Do not create the project session until final confirmation succeeds.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add new project wizard"
```

### Task 5: Build workspace shell and document/reference/generation editors

**Files:**
- Create: `src/CheckListMaker.App/Workspace/WorkspaceView.xaml`, `WorkspaceViewModel.cs`
- Create: Overview, Documents, References, Generation, and Output view/view-model pairs.
- Test: `tests/CheckListMaker.App.Tests/Workspace/WorkspaceViewModelTests.cs`

**Interfaces:** Maps left navigation to Plan 4 use cases and displays dirty/error/warning summaries.

- [ ] **Step 1: Write workspace tests**

Test section visibility by mode, target replace/remove rules, reference add/replace/remove and authority/priority fields, generation format restrictions, overview counts, dirty marker, save, and error-location navigation.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~WorkspaceViewModelTests
```

- [ ] **Step 3: Implement responsive shell**

Use a left `ListBox` with access keys and content pane with `Grid` star sizing/min widths; scroll content rather than clip. PDF shows “評価のみ”; DOCX auto-fix displays a persistent formatting-limit warning.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add project workspace editors"
```

### Task 6: Implement checklist item editing and ID retirement

**Files:**
- Create: `src/CheckListMaker.App/Checklists/{ChecklistEditorView,ChecklistEditorViewModel,CheckItemEditorView,CheckItemEditorViewModel}.{xaml,cs}`
- Test: `tests/CheckListMaker.App.Tests/Checklists/ChecklistEditorViewModelTests.cs`

**Interfaces:** Adds, duplicates, reorders, and deletes items while preserving ID non-reuse.

- [ ] **Step 1: Write item tests**

New IDs are next unused `CHK-####`; duplicate gets a fresh ID and cloned conditions with fresh `COND-####`; delete adds IDs to retired sets; reorder changes display/serialization order; item fields map required/N/A/logic/policy inheritance/notes.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~ChecklistEditorViewModelTests
```

- [ ] **Step 3: Implement master-detail editor**

Left list supports keyboard move/duplicate/delete; right form labels inherited policy clearly. Selection remains stable after reorder/delete. Destructive actions require confirmation.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add checklist item editor"
```

### Task 7: Implement nine condition editors and shared scope editor

**Files:**
- Create: `src/CheckListMaker.App/Checklists/Conditions/*ConditionEditorViewModel.cs`
- Create: `src/CheckListMaker.App/Checklists/Scopes/ScopeEditorViewModel.cs`
- Create: `src/CheckListMaker.App/Resources/ConditionTemplates.xaml`
- Test: `tests/CheckListMaker.App.Tests/Checklists/ConditionEditorTests.cs`

**Interfaces:** Converts typed forms to all Plan 1 condition/scope records.

- [ ] **Step 1: Write one mapping test per type**

Cover semantic instruction, required/forbidden text lists, numeric operators/units/ranges, count measure, absolute dates, pattern presets/custom advanced field, one-of values, cross-source reference selection, and all four scopes with on-not-found behavior.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~ConditionEditorTests
```

- [ ] **Step 3: Implement dynamic data templates**

Condition type combo swaps editor view model/template. Hide irrelevant fields; keep Japanese examples/help. Custom regex is behind “詳細設定” and validates the common subset before applying.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add condition and scope editors"
```

### Task 8: Implement standalone template editor

**Files:**
- Create: `src/CheckListMaker.App/Templates/{TemplateEditorView.xaml,TemplateEditorViewModel.cs}`
- Test: `tests/CheckListMaker.App.Tests/Templates/TemplateEditorViewModelTests.cs`

**Interfaces:** Opens/new/saves `.clmcheck`, edits metadata/default policy/checklist/reference roles, and shows revision/hash state.

- [ ] **Step 1: Write template-editor tests**

New template revision `1`; unchanged save does not increment; semantic save increments; label-only save does not; Save As creates identity/revision `1`; required roles validate unique IDs/names; close dirty prompt.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~TemplateEditorViewModelTests
```

- [ ] **Step 3: Implement reuse of checklist editor**

Template editor hosts the same checklist editor component and a role grid. It never offers target/reference file import and explains that projects assign actual files later.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add checklist template editor"
```

### Task 9: Implement preflight and guarded export UI

**Files:**
- Create: `src/CheckListMaker.App/Preflight/{PreflightView.xaml,PreflightViewModel.cs}`
- Test: `tests/CheckListMaker.App.Tests/Preflight/PreflightViewModelTests.cs`

**Interfaces:** Navigates issues, blocks errors, requires warning and upload disclosure acknowledgements, and exports ZIP.

- [ ] **Step 1: Write preflight/export tests**

Errors disable export; clicking issue navigates/focuses field; warnings require acknowledgment; final dialog lists files/count/total size, states unencrypted ZIP and manual Copilot upload, and requires explicit checkbox. Success offers open-folder and copy-path actions.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~PreflightViewModelTests
```

- [ ] **Step 3: Implement UI**

Use separate error/warning groups with icons and text labels, not color alone. Export progress is cancellable until atomic replacement; incomplete final-name ZIP is never shown.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add preflight and export UI"
```

### Task 10: Add recovery startup, errors, and shortcuts

**Files:**
- Create: recovery view models/views and error presentation components
- Modify: main window commands and startup flow
- Test: `tests/CheckListMaker.App.Tests/Recovery/RecoveryAndErrorTests.cs`

**Interfaces:** Presents recovery candidates without document-name leakage and consistent user-actionable errors.

- [ ] **Step 1: Write recovery/error tests**

Startup candidate list shows timestamp/project path when available but no contained filenames; restore opens dirty session; discard confirms; errors show four required fields; focus returns to triggering control after dialog; Escape closes cancellable dialogs.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~RecoveryAndErrorTests
```

- [ ] **Step 3: Implement shortcuts and presentation**

Add F1 contextual help, Ctrl+S save, Ctrl+E preflight/export, Ctrl+Shift+T template editor, Alt+Left back, and keyboard commands for item/reference movement. Never display raw exception traces.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add recovery and accessible error UX"
```

### Task 11: Add WPF smoke, accessibility, and scaling checks

**Files:**
- Create: `tests/CheckListMaker.App.Tests/UI/{StaTestRunner,XamlSmokeTests,AccessibilityMetadataTests}.cs`
- Create: `docs/testing/wpf-manual-checklist.md`

**Interfaces:** Locks XAML loadability and manual display/accessibility evidence.

- [ ] **Step 1: Add STA smoke tests**

Load every view on an STA thread, instantiate each view model with fakes, verify required resources/templates resolve, and ensure no binding-error listener output during initial render.

- [ ] **Step 2: Add accessibility metadata tests**

Traverse major views and assert interactive controls have automation names or labelled relationships, logical tab order, visible keyboard focus, and non-color status text.

- [ ] **Step 3: Run automated tests and manual scaling checklist**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --configuration Release
```

Record wizard, workspace, checklist editor, template editor, preflight, and dialogs at 100%, 150%, 200%; verify keyboard-only completion and no clipping.

- [ ] **Step 4: Commit**

```powershell
git add tests docs/testing
git commit -m "test: cover WPF accessibility and scaling"
```

## Completion Gate

Complete only when wizard/workspace/template/preflight flows work through use cases, all nine condition forms round-trip, preflight guards are enforced, recovery is privacy-safe, primary workflows are keyboard-operable, XAML/accessibility tests pass, and the scaling checklist is recorded.
