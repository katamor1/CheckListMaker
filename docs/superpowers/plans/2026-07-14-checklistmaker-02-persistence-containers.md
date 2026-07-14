# CheckListMaker Persistence and Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement secure, deterministic, atomic `.clmproj` and `.clmcheck` persistence, staged file import, project locking, and crash recovery.

**Architecture:** Persistence interfaces live in `CheckListMaker.Application`; implementations live in `CheckListMaker.Infrastructure`. Containers are unencrypted ZIP files with fixed ASCII paths, versioned JSON, SHA-256 manifests, safe extraction, and same-directory atomic replacement.

**Tech Stack:** .NET 10, C# 14, `System.Text.Json`, `System.IO.Compression`, `System.Security.Cryptography`, Windows named mutexes, MSTest 4.3.2.

## Global Constraints

- Complete Plan 1 first.
- Never persist original absolute source paths.
- Copy target and references into a private workspace before save.
- Use `%TEMP%/CheckListMaker/Workspaces/<guid>/` and `%LOCALAPPDATA%/CheckListMaker/Recovery/<guid>/`; never include document names in directory names.
- ZIP paths are ASCII, slash-separated, relative, declared in the manifest, and hash-verified.
- Reject rooted paths, drive prefixes, backslashes, empty/`.`/`..` segments, symlinks, duplicate entries, undeclared entries, and hash mismatch.
- Limits: 1,024 entries, 512 MiB per entry, 2 GiB total uncompressed size, 200:1 maximum compression ratio.
- `.clmproj` and `.clmcheck` are deliberately unencrypted.
- Save to a temporary file in the destination directory, verify it, then atomically replace the destination.

---

## Locked Interfaces

```csharp
public interface IFileImportService
{
    Task<ImportedFileDefinition> ImportAsync(string sourcePath, string storedPath, ProjectWorkspace workspace, CancellationToken cancellationToken);
}
public interface IProjectContainerStore
{
    Task SaveAsync(string destinationPath, ProjectDefinition project, ProjectWorkspace workspace, CancellationToken cancellationToken);
    Task<OpenedProject> OpenAsync(string sourcePath, CancellationToken cancellationToken);
}
public interface ITemplateContainerStore
{
    Task SaveAsync(string destinationPath, ChecklistTemplateDefinition template, CancellationToken cancellationToken);
    Task<ChecklistTemplateDefinition> OpenAsync(string sourcePath, CancellationToken cancellationToken);
}
public interface IProjectLockService { IProjectLockHandle Acquire(string projectPath); }
public interface IRecoveryStore
{
    Task SaveSnapshotAsync(string? projectPath, ProjectDefinition project, ProjectWorkspace workspace, CancellationToken cancellationToken);
    Task<IReadOnlyList<RecoveryCandidate>> FindCandidatesAsync(CancellationToken cancellationToken);
    Task DeleteAsync(RecoveryCandidate candidate, CancellationToken cancellationToken);
}
```

### Task 1: Add abstractions and safe workspaces

**Files:**
- Create: `src/CheckListMaker.Application/Abstractions/{IClock,IFileImportService,IProjectContainerStore,ITemplateContainerStore,IProjectLockService,IProjectLockHandle,IRecoveryStore}.cs`
- Create: `src/CheckListMaker.Application/Projects/{ProjectWorkspace,OpenedProject,ChecklistTemplateDefinition,RecoveryCandidate}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Projects/ProjectWorkspaceTests.cs`

**Interfaces:** Produces all contracts above and `ProjectWorkspace.Resolve(string)`.

- [ ] **Step 1: Write traversal tests**

Assert `references/REF-001.pdf` resolves under the root and `../x`, rooted, drive-qualified, and backslash paths throw `ArgumentException`.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~ProjectWorkspaceTests
```

- [ ] **Step 3: Implement workspace containment**

Normalize the root with `Path.GetFullPath`; split stored paths on `/`; reject unsafe segments; resolve with `Path.Combine`; require the result to begin with normalized root plus separator using `OrdinalIgnoreCase`.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src/CheckListMaker.Application tests/CheckListMaker.Infrastructure.Tests
git commit -m "feat: define persistence abstractions"
```

### Task 2: Implement canonical JSON and hashing

**Files:**
- Create: `src/CheckListMaker.Infrastructure/Hashing/{Sha256HashService,CanonicalJson}.cs`
- Create: `src/CheckListMaker.Infrastructure/Containers/ContainerJson.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Hashing/{Sha256HashServiceTests,CanonicalJsonTests}.cs`

**Interfaces:** Produces lowercase SHA-256 and canonical UTF-8 JSON with ordinally sorted object properties.

- [ ] **Step 1: Write known-vector and canonicalization tests**

`abc` must hash to `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`; reordered objects must canonicalize to identical bytes while array order remains unchanged.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter "FullyQualifiedName~Sha256HashServiceTests|FullyQualifiedName~CanonicalJsonTests"
```

- [ ] **Step 3: Implement**

Use `SHA256.HashData`/`HashDataAsync`. Parse with `JsonDocument`, recursively sort object properties using `StringComparer.Ordinal`, preserve raw JSON number tokens, and write without insignificant whitespace.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src/CheckListMaker.Infrastructure tests/CheckListMaker.Infrastructure.Tests
git commit -m "feat: add canonical JSON and hashing"
```

### Task 3: Stage imported files

**Files:**
- Create: `src/CheckListMaker.Infrastructure/Files/{FileImportService,SystemClock}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Files/FileImportServiceTests.cs`

**Interfaces:** Implements `IFileImportService.ImportAsync`.

- [ ] **Step 1: Write import tests**

Cover Japanese filenames, ASCII stored names, byte/hash preservation, `.md/.txt/.docx/.pdf`, unsupported extension rejection, safe replacement, and absence of the absolute source path in returned metadata.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~FileImportServiceTests
```

- [ ] **Step 3: Implement staged copy**

Copy to `<destination>.partial-<guid>`, flush to disk, atomically move into the workspace, hash the staged copy, and delete partial files in `finally`. Return `Path.GetFileName(sourcePath)` only.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src/CheckListMaker.Infrastructure tests/CheckListMaker.Infrastructure.Tests
git commit -m "feat: import project files into workspaces"
```

### Task 4: Validate and extract ZIP safely

**Files:**
- Create: `src/CheckListMaker.Infrastructure/Containers/{ArchiveSecurityPolicy,SafeZipArchive}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Containers/SafeZipArchiveTests.cs`

**Interfaces:** Produces `Inspect`, `ReadEntry`, and `ExtractToWorkspaceAsync` with fixed security limits.

- [ ] **Step 1: Write malicious-container tests**

Create ZIPs containing traversal, rooted paths, backslashes, duplicate entries, symlink attributes, excessive entry count/size/ratio, and assert rejection before extraction. Add one valid archive test.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~SafeZipArchiveTests
```

- [ ] **Step 3: Implement preflight inspection and extraction**

Inspect every entry before writing any file. For each output, compute `Path.GetFullPath` and require containment in the destination. Reject Unix symlink mode `0xA000` from external attributes. Stream extraction with cancellation.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src/CheckListMaker.Infrastructure tests/CheckListMaker.Infrastructure.Tests
git commit -m "feat: secure ZIP container handling"
```

### Task 5: Implement `.clmproj` round-trip storage

**Files:**
- Create: `src/CheckListMaker.Infrastructure/Containers/{ProjectContainerStore,ProjectContainerDocuments,FileManifestDocument}.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Containers/ProjectContainerStoreTests.cs`

**Interfaces:** Implements `IProjectContainerStore`.

- [ ] **Step 1: Write round-trip tests**

Expected entries:

```text
project.json
checklist.json
target/TARGET.<ext>                     # existing mode
references/REF-001.<ext>
metadata/file-manifest.json
generation/document-generation.json    # generation mode instead of target
```

Assert source absolute paths are absent; every file is declared and hash-matched; unknown/missing entries fail open.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~ProjectContainerStoreTests
```

- [ ] **Step 3: Implement deterministic container documents**

Serialize project metadata separately from `checklist.json`; write entries in ordinal path order with ZIP timestamp `1980-01-01T00:00:00Z`; build manifest from final bytes; on open validate format major version, manifest completeness, hashes, mode-specific entries, and deserialize with unknown-member rejection.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src/CheckListMaker.Infrastructure tests/CheckListMaker.Infrastructure.Tests
git commit -m "feat: persist CheckListMaker projects"
```

### Task 6: Guarantee atomic saves

**Files:**
- Create: `src/CheckListMaker.Infrastructure/Files/AtomicFileWriter.cs`
- Modify: `ProjectContainerStore.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Files/AtomicFileWriterTests.cs`

**Interfaces:** Produces `WriteAndReplaceAsync(destination, write, verify, cancellationToken)`.

- [ ] **Step 1: Write failure-injection tests**

Start with an existing destination. Inject write failure and verification failure; assert original bytes remain and no final-name partial file exists. Add success for new and existing destinations.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~AtomicFileWriterTests
```

- [ ] **Step 3: Implement same-directory replacement**

Write `<destination>.tmp-<guid>` in the same directory, close, reopen and verify, then `File.Replace` existing destinations or `File.Move` new ones. Delete temporary files only after preserving recovery evidence when requested.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src/CheckListMaker.Infrastructure tests/CheckListMaker.Infrastructure.Tests
git commit -m "feat: make project saves atomic"
```

### Task 7: Implement `.clmcheck` and semantic revisioning

**Files:**
- Create: `src/CheckListMaker.Infrastructure/Containers/{TemplateContainerStore,TemplateContainerDocuments}.cs`
- Create: `src/CheckListMaker.Application/Projects/ChecklistTemplateDefinition.cs`
- Test: `tests/CheckListMaker.Infrastructure.Tests/Containers/TemplateContainerStoreTests.cs`

**Interfaces:** Implements `ITemplateContainerStore`; preserves template identity on overwrite and creates a new identity on Save As.

- [ ] **Step 1: Write template tests**

Assert only `template.json`, `checklist.json`, and `metadata/manifest.json` exist; no document bytes are allowed. Revision starts at `1`, increments only when canonical semantic content changes, and timestamps/fold state do not affect the content hash.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter FullyQualifiedName~TemplateContainerStoreTests
```

- [ ] **Step 3: Implement revision rules**

Hash normalized template name/description/purpose, default policy, checklist, scopes, conditions, and required reference roles while excluding identity, revision, labels, and timestamps. Save As issues a new UUID and revision `1`.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: persist checklist templates"
```

### Task 8: Add locking and recovery

**Files:**
- Create: `src/CheckListMaker.Infrastructure/Locking/{ProjectLockService,ProjectLockHandle,ProjectAlreadyOpenException}.cs`
- Create: `src/CheckListMaker.Infrastructure/Recovery/RecoveryStore.cs`
- Test: corresponding locking/recovery tests.

**Interfaces:** Implements `IProjectLockService` and `IRecoveryStore`.

- [ ] **Step 1: Write contention and recovery tests**

Acquire the same normalized path twice and require the second call to fail; equivalent path spellings must share a mutex. Recovery snapshots use random directories, contain no original document names in paths, enumerate after simulated crash, and delete completely.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --filter "FullyQualifiedName~ProjectLockServiceTests|FullyQualifiedName~RecoveryStoreTests"
```

- [ ] **Step 3: Implement**

Mutex name is `Local\CheckListMaker-<sha256(normalized-absolute-path)>`. Recovery writes a verified project container plus minimal metadata with optional original project path; it never stores source import paths.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj
git add src tests
git commit -m "feat: add project locking and recovery"
```

### Task 9: Add compatibility and path fixtures

**Files:**
- Create: `tests/CheckListMaker.Infrastructure.Tests/Fixtures/{project-v1-existing.clmproj,project-v1-generation.clmproj,template-v1.clmcheck}`
- Create: `tests/CheckListMaker.Infrastructure.Tests/Containers/CompatibilityTests.cs`

**Interfaces:** Locks format `1.0` and Windows path behavior.

- [ ] **Step 1: Add fixture tests**

Open committed v1 fixtures; reject unknown major versions; exercise Japanese, spaces, read-only source folder, and long destination paths; assert deterministic container entry ordering and manifest hashes.

- [ ] **Step 2: Run the suite**

```powershell
dotnet test tests/CheckListMaker.Infrastructure.Tests/CheckListMaker.Infrastructure.Tests.csproj --configuration Release
```

- [ ] **Step 3: Commit fixtures**

```powershell
git add tests/CheckListMaker.Infrastructure.Tests
git commit -m "test: lock container compatibility"
```

- [ ] **Step 4: Run the completion gate**

```powershell
dotnet test CheckListMaker.sln --configuration Release
dotnet build CheckListMaker.sln --configuration Release
```

## Completion Gate

Complete only when projects/templates round-trip, malicious archives are rejected before extraction, manifests catch missing/unknown/hash-mismatched entries, source absolute paths never persist, failed saves retain originals, and locking/recovery tests pass on Windows 11.
