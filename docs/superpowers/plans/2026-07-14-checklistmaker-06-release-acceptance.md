# CheckListMaker Release Hardening and Acceptance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a privacy-preserving, diagnosable, CI-tested, self-contained Windows 11 x64 `CheckListMaker.exe` and prove all MVP acceptance criteria.

**Architecture:** Add bounded redacted logging, top-level error boundaries, a noninteractive self-check, deterministic PowerShell scripts, Windows CI, single-file publication verification, clean-machine testing, and user/operator documentation. The release directory contains one EXE; user projects/packages remain external files.

**Tech Stack:** .NET 10 SDK, WPF self-contained single-file publish, PowerShell 7, GitHub Actions Windows runners, Python 3.9/current for generated validator tests, MSTest 4.3.2.

## Global Constraints

- Complete Plans 1–5 first.
- Publish only `win-x64`; support Windows 11 x64.
- Deliver one self-contained EXE; require no installed .NET, Python, Node.js, administrator rights, installer, service, or registry registration.
- WPF trimming is disabled; native libraries may self-extract under `%TEMP%/.net`.
- No telemetry or application network communication.
- Logs are local, bounded, and contain no document text, evidence excerpts, checklist free text, original filenames, or unredacted absolute paths.
- Do not claim code signing, auto-update, encryption, other OS support, or perfect DOCX formatting.
- Application version is `0.1.0`; formats/protocols remain `1.0`.
- Production runtime uses no third-party package.

---

### Task 1: Add redacted logging and exception boundaries

**Files:**
- Create: `src/CheckListMaker.App/Diagnostics/{ILocalLogger,LocalFileLogger,PrivacyRedactor,GlobalExceptionHandler}.cs`
- Modify: `src/CheckListMaker.App/App.xaml.cs`
- Test: `tests/CheckListMaker.App.Tests/Diagnostics/{PrivacyRedactorTests,LocalFileLoggerTests,GlobalExceptionHandlerTests}.cs`

**Interfaces:** Logs JSON Lines to local storage and prevents false-success UI after unhandled failures.

- [ ] **Step 1: Write privacy tests**

Assert redaction removes/hashes absolute paths, original/Japanese filenames, reference titles, checklist instructions, evidence excerpts, and email addresses while preserving event, UTC time, exception type, stable code, format version, package ID, hash prefix, and success flag.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter "FullyQualifiedName~PrivacyRedactorTests|FullyQualifiedName~LocalFileLoggerTests|FullyQualifiedName~GlobalExceptionHandlerTests"
```

- [ ] **Step 3: Implement bounded JSONL logs**

Write `%LOCALAPPDATA%/CheckListMaker/Logs/checklistmaker-0.log`, rotate at 1 MiB, retain five files, and never fail a user operation when logging itself fails. Register dispatcher, unobserved-task, and AppDomain exception handlers; show a redacted recovery-oriented dialog and terminate when state safety is unknown.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add privacy-safe diagnostics"
```

### Task 2: Add a noninteractive application self-check

**Files:**
- Create: `src/CheckListMaker.App/SelfCheck/{SelfCheckRunner,SelfCheckResult}.cs`
- Modify: `App.xaml.cs`
- Test: `tests/CheckListMaker.App.Tests/SelfCheck/SelfCheckRunnerTests.cs`

**Interfaces:** `CheckListMaker.exe --self-check --output <path>` exits `0` on success and nonzero on failure.

- [ ] **Step 1: Write self-check tests**

Check writable temp/local-app-data, domain serialization, project/template round-trip, package generation, manifest/hash verification, and generated validator text presence. Python is optional for app self-check and reported as `not_run` when absent.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~SelfCheckRunnerTests
```

- [ ] **Step 3: Implement machine-readable result**

```json
{"applicationVersion":"0.1.0","success":true,"checks":[{"name":"project_round_trip","status":"passed"}]}
```

The command opens no window, writes no user document content, cleans temporary artifacts, and uses stable check names.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add src tests
git commit -m "feat: add application self-check"
```

### Task 3: Configure one-file Windows publication

**Files:**
- Create: `src/CheckListMaker.App/Properties/PublishProfiles/win-x64-single-file.pubxml`
- Modify: `src/CheckListMaker.App/CheckListMaker.App.csproj`
- Create: `eng/publish.ps1`, `eng/verify-publish.ps1`
- Test: `tests/CheckListMaker.App.Tests/Release/PublishSettingsTests.cs`

**Interfaces:** Produces `artifacts/publish/win-x64/CheckListMaker.exe` as the only file.

- [ ] **Step 1: Write project/publish tests**

Assert `RuntimeIdentifier=win-x64`, self-contained, single-file, native libraries self-extracted, trimming false, ReadyToRun false unless measured, version `0.1.0`, and no config/PDB/runtime files in final directory.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~PublishSettingsTests
```

- [ ] **Step 3: Implement profile and verification**

Use:

```xml
<SelfContained>true</SelfContained>
<PublishSingleFile>true</PublishSingleFile>
<IncludeNativeLibrariesForSelfExtract>true</IncludeNativeLibrariesForSelfExtract>
<PublishTrimmed>false</PublishTrimmed>
<DebugType>none</DebugType>
```

`verify-publish.ps1` requires exactly one file, checks PE x64, runs self-check from a read-only directory with a clean temporary user profile, and fails on any companion file.

- [ ] **Step 4: Publish and commit**

```powershell
./eng/publish.ps1
./eng/verify-publish.ps1
git add src eng tests
git commit -m "build: publish a single Windows executable"
```

### Task 4: Add deterministic restore and test scripts

**Files:**
- Create: `eng/{restore,test}.ps1`
- Modify: repository package lock files
- Test: `tests/CheckListMaker.App.Tests/Release/BuildScriptTests.cs`

**Interfaces:** Standard developer/CI commands with consistent exit codes.

- [ ] **Step 1: Write script contract tests**

Assert scripts set strict mode, stop on errors, locate repository root independently of working directory, use locked restore, Release configuration, no-restore after restore, and place test results under `artifacts/test-results`.

- [ ] **Step 2: Implement scripts**

```powershell
./eng/restore.ps1   # dotnet restore CheckListMaker.sln --locked-mode
./eng/test.ps1      # dotnet test ... -c Release --no-restore --logger trx
```

Clean only controlled `artifacts` subdirectories; never delete user project/package paths.

- [ ] **Step 3: Run**

```powershell
./eng/restore.ps1
./eng/test.ps1
```

- [ ] **Step 4: Commit**

```powershell
git add eng packages.lock.json tests
git commit -m "build: add deterministic restore and test scripts"
```

### Task 5: Add no-network source and assembly audit

**Files:**
- Create: `eng/verify-no-network.ps1`
- Create: `tests/CheckListMaker.App.Tests/Release/NoNetworkAuditTests.cs`

**Interfaces:** Fails when production code or published dependencies introduce network-capable APIs/packages outside an explicit empty allowlist.

- [ ] **Step 1: Write audit tests**

Detect `HttpClient`, `WebClient`, `HttpWebRequest`, `TcpClient`, `UdpClient`, `Socket`, `Dns`, `System.Net.*`, browser automation packages, telemetry SDKs, update clients, and URLs used for runtime calls. Documentation URLs are ignored only under `docs/`.

- [ ] **Step 2: Run and confirm current pass/fail behavior**

```powershell
./eng/verify-no-network.ps1
```

- [ ] **Step 3: Implement source, lock-file, and published-assembly scans**

Scan `src`, `packages.lock.json`, `.deps.json` extracted during verification, and IL string/type references. Fail with file/member/package and remediation. Keep the allowlist empty for MVP.

- [ ] **Step 4: Verify and commit**

```powershell
./eng/verify-no-network.ps1
git add eng tests
git commit -m "test: enforce offline-only production code"
```

### Task 6: Add Windows GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:** Runs restore, tests, Python compatibility, publish verification, and no-network audit.

- [ ] **Step 1: Define jobs**

Use `windows-latest`, `actions/checkout`, `actions/setup-dotnet` for `10.0.x`, and `actions/setup-python` matrix `3.9` plus current stable. Cache NuGet by lock files. Grant `contents: read` only.

- [ ] **Step 2: Add required commands**

```powershell
./eng/restore.ps1
./eng/test.ps1
./eng/verify-no-network.ps1
./eng/publish.ps1
./eng/verify-publish.ps1
```

Python jobs generate a golden package and execute `validate_output.py --self-test` and valid/invalid fixture commands.

- [ ] **Step 3: Upload non-sensitive artifacts**

Upload TRX/coverage, self-check JSON, publish metadata, and acceptance templates. Do not upload fixture documents, project containers, exported packages, logs with paths, or the EXE from untrusted pull requests.

- [ ] **Step 4: Commit and verify workflow syntax**

```powershell
git add .github/workflows/ci.yml
git commit -m "ci: verify Windows MVP builds"
```

### Task 7: Write user, package, and privacy documentation

**Files:**
- Create: `README.md`, `CHANGELOG.md`
- Create: `docs/{package-format-1.0,security-and-privacy,user-guide}.md`
- Create: `docs/testing/release-checklist.md`
- Test: `tests/CheckListMaker.App.Tests/Documentation/DocumentationContractTests.cs`

**Interfaces:** Documents supported behavior without overstating guarantees.

- [ ] **Step 1: Write documentation contract tests**

Require exact statements: Windows 11 x64; one EXE; local-only; no telemetry/network; unencrypted `.clmproj/.clmcheck/ZIP`; manual Copilot upload; PDF no editing; DOCX best-effort; result JSON authoritative; Python validation checks structure not truth; no API/browser automation/result re-import.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj --filter FullyQualifiedName~DocumentationContractTests
```

- [ ] **Step 3: Write docs**

Package-format doc lists exact paths, versions, hashes, output artifacts, validator commands/exit codes, and trust limits. User guide walks wizard, workspace, template, preflight, Copilot upload, validator execution, and failure recovery in Japanese.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.App.Tests/CheckListMaker.App.Tests.csproj
git add README.md CHANGELOG.md docs tests
git commit -m "docs: add MVP user and format guides"
```

### Task 8: Build a clean Windows Sandbox acceptance harness

**Files:**
- Create: `eng/windows-sandbox/{CheckListMaker.wsb,run-acceptance.ps1}`
- Create: `tests/acceptance/fixtures/*`
- Test: `docs/testing/windows-sandbox-results-template.md`

**Interfaces:** Verifies the published EXE without installed .NET/Python and with network disabled.

- [ ] **Step 1: Create synthetic non-sensitive fixtures**

Include MD, TXT, simple DOCX, PDF, references, one template, all nine conditions, existing and generation workflows, and malformed container copies. Use invented names/data only.

- [ ] **Step 2: Implement sandbox script**

Copy only the EXE/fixtures/scripts into Sandbox, disable networking, run app self-check, launch from read-only folder as standard user, create/save/reopen project and template, export packages, verify one-file distribution, and collect redacted results to a mapped output folder.

- [ ] **Step 3: Run on Windows 11**

```powershell
Start-Process .\eng\windows-sandbox\CheckListMaker.wsb -Wait
```

Record OS build, EXE SHA-256, application version, check results, and tester; no screenshots or logs may contain sensitive data.

- [ ] **Step 4: Commit harness, not transient results**

```powershell
git add eng/windows-sandbox tests/acceptance docs/testing/windows-sandbox-results-template.md
git commit -m "test: add clean Windows acceptance harness"
```

### Task 9: Run and record the MVP acceptance gate

**Files:**
- Modify: `docs/testing/release-checklist.md`
- Create: `docs/testing/releases/0.1.0-acceptance.md`

**Interfaces:** Maps evidence to all 17 approved acceptance criteria.

- [ ] **Step 1: Run automated gate**

```powershell
./eng/restore.ps1
./eng/test.ps1
./eng/verify-no-network.ps1
./eng/publish.ps1
./eng/verify-publish.ps1
```

- [ ] **Step 2: Run manual UI/clean-machine gate**

Complete Windows Sandbox, keyboard-only wizard/workspace/template/preflight, 100/150/200% scaling, corrupt/save/export/recovery failures, offline package generation, and disclosure review.

- [ ] **Step 3: Record immutable evidence**

Acceptance file includes commit SHA, EXE SHA-256, command exit codes, test counts, Python versions, sandbox OS build, each criterion pass/fail, deviations, and reviewer sign-off. Never include document content, original filenames, reference excerpts, absolute user paths, or raw logs.

- [ ] **Step 4: Commit acceptance record**

```powershell
git add docs/testing
git commit -m "test: record CheckListMaker 0.1.0 acceptance"
```

Do not create a tag or release until the user explicitly approves the recorded acceptance evidence.

## Completion Gate

Complete only when the single EXE launches on clean Windows 11 without runtimes/admin rights, self-check passes, exported validator self-test passes when Python exists, all 17 acceptance criteria are evidenced, documentation accurately states limits, logs/evidence are privacy-safe, and no network-capable production dependency is present.
