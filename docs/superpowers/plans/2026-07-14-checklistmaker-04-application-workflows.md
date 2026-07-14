# CheckListMaker Application Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement UI-independent sessions, project/document/reference/template use cases, deterministic preflight checks, guarded export, recent history, and recovery coordination.

**Architecture:** `CheckListMaker.Application` orchestrates domain and persistence/package abstractions without WPF or filesystem implementation. `ProjectSession` owns immutable project state, workspace, path, lock/lease, saved semantic fingerprint, and dirty state; use cases return explicit application results suitable for view models.

**Tech Stack:** .NET 10, C# 14, Plan 1 domain contracts, Plan 2 storage interfaces, Plan 3 package interface, MSTest 4.3.2.

## Global Constraints

- Complete Plans 1–3 first.
- Application code references no WPF, ZIP, concrete filesystem, or Python process API.
- Blocking preflight errors prevent save/export as specified; unsaved changes always prevent export.
- Existing mode requires exactly one target; generation mode requires generation settings and no target.
- PDF target is read-only; generation output is MD, TXT, or DOCX.
- References are multiple and always read-only.
- Issue codes and locations are stable UI contracts.
- Recent history stores normalized project paths and last-opened timestamps only.
- Recovery snapshots run only for dirty sessions and never replace the primary project.

---

### Task 1: Implement project sessions and semantic dirty tracking

**Files:**
- Create: `src/CheckListMaker.Application/Abstractions/IProjectFingerprintService.cs`
- Create: `src/CheckListMaker.Application/Sessions/{ProjectSession,SessionStateChangedEventArgs}.cs`
- Create: `src/CheckListMaker.Infrastructure/Hashing/ProjectFingerprintService.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Application/ProjectSessionTests.cs`

**Interfaces:** Produces `Apply(ProjectDefinition)`, `MarkSaved(string)`, `IsDirty`, `ProjectPath`, and `StateChanged`.

- [ ] **Step 1: Write failing session tests**

Test new session dirty, opened session clean, semantic update dirty, equal update unchanged, save clears dirty, and async dispose releases lock/workspace exactly once.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~ProjectSessionTests
```

- [ ] **Step 3: Implement semantic fingerprinting and session state**

```csharp
public interface IProjectFingerprintService
{
    string ComputeProject(ProjectDefinition project);
    string ComputeChecklist(ChecklistDefinition checklist, RepairPolicy defaultPolicy);
}
```

Hash canonical domain JSON. `ProjectSession.Apply` compares fingerprints; `MarkSaved` stores path/fingerprint and clears dirty; `DisposeAsync` is idempotent.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: add project sessions and dirty tracking"
```

### Task 2: Create, open, save, and close sessions

**Files:**
- Create: `src/CheckListMaker.Application/Projects/{CreateProjectSessionUseCase,OpenProjectSessionUseCase,SaveProjectUseCase,CloseProjectSessionUseCase}.cs`
- Create: `src/CheckListMaker.Application/Errors/{ApplicationError,ApplicationResult}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Application/ProjectLifecycleUseCaseTests.cs`

**Interfaces:** Produces explicit success/error results with `Code`, Japanese `Message`, `Impact`, and `NextAction`.

- [ ] **Step 1: Write lifecycle tests**

Cover new existing/generation sessions, open lock contention, corrupt container, save-as, save failure retaining dirty state/original file, and close behavior for clean, discard, and cancel.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~ProjectLifecycleUseCaseTests
```

- [ ] **Step 3: Implement one-action use cases**

Acquire lock before opening; transfer lock/workspace leases to session; validate mode before save; invoke container store; call `MarkSaved` only after success. Map expected exceptions to stable application error codes without stack traces in the user message.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: add project lifecycle workflows"
```

### Task 3: Add target and reference workflows

**Files:**
- Create: `src/CheckListMaker.Application/Projects/{SetTargetDocumentUseCase,AddReferenceDocumentUseCase,ReplaceReferenceDocumentUseCase,RemoveReferenceDocumentUseCase}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Application/DocumentWorkflowTests.cs`

**Interfaces:** Imports bytes through `IFileImportService`, updates immutable project state, and returns the updated session.

- [ ] **Step 1: Write document tests**

Cover supported extensions, PDF editability false, generation-mode target rejection, next sequential `REF-###`, authority/priority validation, replacement retaining reference ID/roles, removal blocked when a required role would be unassigned, and retired IDs not reused.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~DocumentWorkflowTests
```

- [ ] **Step 3: Implement workflows**

Import to `target/TARGET.ext` or `references/REF-###.ext`; remove superseded staged bytes only after successful import; never mutate source files. Validate authority and priority before applying session state.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: manage target and reference documents"
```

### Task 4: Implement template save and copy-import

**Files:**
- Create: `src/CheckListMaker.Application/Templates/{ImportTemplateUseCase,SaveTemplateUseCase,TemplateImportResult}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Application/TemplateWorkflowTests.cs`

**Interfaces:** Copies checklist/default policy into the project and records template origin metadata.

- [ ] **Step 1: Write template tests**

Assert import copies rather than links, origin records ID/revision/label/hash/time, project edits set `ModifiedAfterImport`, source template remains unchanged, required roles appear unassigned, overwrite preserves identity/revision rules, Save As issues new identity.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~TemplateWorkflowTests
```

- [ ] **Step 3: Implement deep-copy mapping**

Round-trip through domain JSON or explicit immutable reconstruction; do not retain mutable collection references. Template paths are not persisted in the project.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: add checklist template workflows"
```

### Task 5: Implement deterministic preflight validation

**Files:**
- Create: `src/CheckListMaker.Application/Preflight/{PreflightSeverity,PreflightLocation,PreflightIssue,PreflightReport,PreflightValidator}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Application/PreflightValidatorTests.cs`

**Interfaces:** Produces ordered errors/warnings with navigation locations.

- [ ] **Step 1: Write one test per approved issue**

Blocking codes include missing/extra target, unsupported format, missing role assignment, authority missing, duplicate IDs, empty condition group, condition-specific missing values, unknown reference ID, unsupported regex, contract/validator generation failure, internal path collision, hash failure, and dirty session. Warning codes include authority/priority ties, broad semantic locator, required item allowing N/A, DOCX auto-fix, PDF auto-fix, and large package.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~PreflightValidatorTests
```

- [ ] **Step 3: Implement ordered preflight**

```csharp
public sealed record PreflightLocation(string Section, string? EntityId = null, string? Field = null);
public sealed record PreflightIssue(string Code, PreflightSeverity Severity, PreflightLocation Location, string Message, string Remediation);
public sealed record PreflightReport(IReadOnlyList<PreflightIssue> Issues)
{
    public bool HasErrors => Issues.Any(x => x.Severity == PreflightSeverity.Error);
}
```

Sort errors before warnings, then section/entity/code. Reuse domain validator issue codes where applicable.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: add package preflight validation"
```

### Task 6: Implement guarded Copilot-package export

**Files:**
- Create: `src/CheckListMaker.Application/Export/{ExportCopilotPackageUseCase,ExportCopilotPackageRequest,ExportCopilotPackageResult}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Application/ExportCopilotPackageUseCaseTests.cs`

**Interfaces:** Calls `ICopilotPackageGenerator` only after all guards pass.

- [ ] **Step 1: Write guard tests**

Block dirty sessions, errors, unacknowledged warnings, and missing explicit confirmation that package contents may be uploaded to Copilot. Verify generator is not called. Success uses a new UUID and returns path, package ID, byte size, file count, and warnings.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~ExportCopilotPackageUseCaseTests
```

- [ ] **Step 3: Implement export**

Re-run preflight immediately before generation; generate to temporary destination and atomically move; never alter session project/workspace. Delete partial ZIP on failure and return a redacted error.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: guard Copilot package export"
```

### Task 7: Store recent project history safely

**Files:**
- Create: `src/CheckListMaker.Application/Abstractions/IRecentProjectsStore.cs`
- Create: `src/CheckListMaker.Application/Recent/{RecentProjectEntry,RecentProjectsService}.cs`
- Create: `src/CheckListMaker.Infrastructure/Settings/{UserSettingsPathProvider,JsonRecentProjectsStore}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Application/RecentProjectsServiceTests.cs`

**Interfaces:** Keeps at most 10 normalized paths with last-opened time.

- [ ] **Step 1: Write privacy and ordering tests**

Deduplicate equivalent paths, order newest first, cap at 10, remove missing entries, clear all, recover from malformed settings, and assert settings contain no document names/content/reference metadata except the project file path itself.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~RecentProjectsServiceTests
```

- [ ] **Step 3: Implement atomic settings storage**

Store under `%LOCALAPPDATA%/CheckListMaker/settings/recent-projects.json`; write atomically; treat corruption as empty history and preserve a `.corrupt-<timestamp>` copy.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: store recent projects safely"
```

### Task 8: Coordinate recovery snapshots

**Files:**
- Create: `src/CheckListMaker.Application/Recovery/RecoveryCoordinator.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Application/RecoveryCoordinatorTests.cs`

**Interfaces:** Exposes `SnapshotIfDirtyAsync`, `FindCandidatesAsync`, `RestoreAsync`, and `DiscardAsync`.

- [ ] **Step 1: Write recovery coordination tests**

Clean sessions do not snapshot; dirty sessions do; concurrent timer ticks coalesce; successful save/clean close deletes snapshot; failed save retains it; restore opens a dirty unsaved session without overwriting original; discard deletes only selected candidate.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~RecoveryCoordinatorTests
```

- [ ] **Step 3: Implement with a semaphore**

Use `SemaphoreSlim(1,1)` to serialize snapshots and cancellation tokens for shutdown. Surface recovery metadata only; do not expose document filenames on the startup screen.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: coordinate project recovery"
```

### Task 9: Add a headless end-to-end workflow

**Files:**
- Create: `tests/CheckListMaker.Infrastructure.Tests/Application/HeadlessWorkflowTests.cs`

**Interfaces:** Proves Plans 1–4 integrate without WPF.

- [ ] **Step 1: Write end-to-end test**

Create project, import target/references, add all nine condition types, save/open, save/import template, run preflight, acknowledge warnings/upload, export ZIP, extract it, and run `python validate_output.py --self-test` when Python is available. Assert session remains unchanged and exported manifest verifies.

- [ ] **Step 2: Run and fix only integration defects**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~HeadlessWorkflowTests
```

- [ ] **Step 3: Run the full suite**

```powershell
dotnet test CheckListMaker.sln --configuration Release
```

- [ ] **Step 4: Commit**

```powershell
git add tests
git commit -m "test: cover headless MVP workflow"
```

## Completion Gate

Complete only when lifecycle operations preserve data on failure; every preflight requirement has a stable code/location; dirty/unacknowledged/invalid sessions cannot export; recent history leaks no document data; recovery never modifies the primary file; and the headless exported package passes Python self-test.
