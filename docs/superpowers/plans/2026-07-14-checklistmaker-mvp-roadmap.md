# CheckListMaker MVP Implementation Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved CheckListMaker MVP through six ordered, independently reviewable implementation plans.

**Architecture:** Work proceeds from stable domain contracts to secure local persistence, deterministic Copilot package generation, UI-independent workflows, WPF presentation, and release acceptance. Each plan ends with a test gate; later plans consume only interfaces and artifacts locked by earlier plans. Implementation should use an isolated worktree and frequent commits exactly as listed in each detailed plan.

**Tech Stack:** .NET 10, C# 14, WPF/MVVM, `System.Text.Json`, `System.IO.Compression`, `System.Security.Cryptography`, Python 3.9+ standard library for generated validators, MSTest 4.3.2, Windows 11 x64.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-14-checklistmaker-mvp-design.md`.
- The application is offline, local-only, single-user, Windows 11 x64, and distributed as one self-contained EXE.
- The application never calls AI or automates the Copilot browser.
- Copilot output re-import is outside MVP.
- `.clmproj`, `.clmcheck`, and Copilot ZIP files are not encrypted.
- `result.json` is the authoritative result; reports and documents are derivatives.
- PDF is evaluation/reference-only and never receives an applied repair.
- The Python validator is generated, uses standard library only, and validates structure/consistency rather than truth.
- Implementation follows TDD and commits after every task.

---

## Plan Order

| Order | Plan | Deliverable | Blocking gate |
|---:|---|---|---|
| 1 | `2026-07-14-checklistmaker-01-foundation-domain.md` | Solution, domain contracts, rules, JSON round-trip | Domain tests and Release build pass |
| 2 | `2026-07-14-checklistmaker-02-persistence-containers.md` | `.clmproj`, `.clmcheck`, import, hashes, safe ZIP, atomic save, lock/recovery | Persistence/security tests pass on Windows |
| 3 | `2026-07-14-checklistmaker-03-output-contract-package.md` | Schema, generated Python validator, prompts, manifest, deterministic Copilot ZIP | Python self-test and mutation suites pass |
| 4 | `2026-07-14-checklistmaker-04-application-workflows.md` | Sessions, use cases, preflight, export guards, recent/recovery coordination | Headless end-to-end workflow passes |
| 5 | `2026-07-14-checklistmaker-05-wpf-ui.md` | Wizard, workspace, checklist/template editors, preflight/export UI | WPF tests, XAML smoke, accessibility checks pass |
| 6 | `2026-07-14-checklistmaker-06-release-acceptance.md` | Logging, self-check, CI, one-file publish, clean-machine acceptance, docs | All MVP acceptance evidence recorded |

Do not implement plans out of order. A later plan may add a narrowly scoped type to an earlier project, but it must not silently change an earlier public interface; update the earlier plan and tests first when a contract change is necessary.

## Cross-Plan Interface Locks

### Domain locks after Plan 1

```text
ProjectDefinition
ChecklistDefinition
CheckItemDefinition
ConditionDefinition hierarchy
ScopeDefinition hierarchy
ReferenceDocumentDefinition
RepairPolicyResolver
ReferencePrecedenceComparer
ResultAggregationService
DomainJson.CreateOptions()
```

### Persistence locks after Plan 2

```text
IProjectContainerStore
ITemplateContainerStore
IFileImportService
IProjectLockService
IRecoveryStore
ProjectWorkspace
OpenedProject
ChecklistTemplateDefinition
CanonicalJson
Sha256HashService
```

### Package locks after Plan 3

```text
OutputContractDefinition
OutputContractFactory
ContractFingerprintService
ICopilotPackageGenerator implementation
CopilotPackageGenerationRequest
CopilotPackageBuilder
validate_output.py CLI and stable error codes
Package Format 1.0 paths
```

### Workflow locks after Plan 4

```text
ProjectSession
PreflightIssue / PreflightLocation / PreflightReport
Create/Open/Save/Close use cases
Document/reference/template use cases
ExportCopilotPackageUseCase
RecentProjectsService
RecoveryCoordinator
ApplicationError / ApplicationResult<T>
```

## Specification Coverage Matrix

| Approved specification section | Implemented by |
|---|---|
| 1–7 overview, goals, trust model, architecture | Plans 1, 3, 6 |
| 8 GUI design and accessibility | Plan 5 Tasks 2–11 |
| 9 `.clmproj` | Plan 2 Tasks 1–6, 8–9 |
| 10 `.clmcheck` | Plan 2 Task 7; Plan 4 Task 4; Plan 5 Task 8 |
| 11 document/reference formats and DOCX limits | Plan 1 project model; Plan 4 Task 3; Plan 5 Tasks 4–5 |
| 12 authority and conflicts | Plan 1 Task 6; Plan 3 Task 6; Plan 5 Task 5 |
| 13 checklist IDs/model | Plan 1 Tasks 2–5; Plan 5 Task 6 |
| 14 nine condition types | Plan 1 Tasks 4–5; Plan 5 Task 7 |
| 15 scopes | Plan 1 Task 4; Plan 3 Task 6; Plan 5 Task 7 |
| 16 result states and aggregation | Plan 1 Task 7; Plan 3 Task 5 |
| 17 repair policies | Plan 1 Task 6; Plan 3 Task 6; Plan 5 Tasks 4–7 |
| 18 existing-document mode | Plans 3, 4, 5 |
| 19 generation mode | Plans 1, 3, 4, 5 |
| 20 package structure and manifest | Plan 3 Tasks 8–10 |
| 21 Python validator | Plan 3 Tasks 4–7, 11 |
| 22 execution protocol | Plan 3 Task 9 |
| 23 Copilot artifacts | Plan 3 Tasks 6–10 |
| 24 result JSON | Plan 3 Tasks 1–7 |
| 25 evidence | Plan 3 Task 6 |
| 26 preflight | Plan 4 Task 5; Plan 5 Task 9 |
| 27 security/privacy | Plan 2 Task 4; Plan 3 prompts; Plan 6 Tasks 1, 5, 7 |
| 28 error handling | Plan 2 Task 6; Plan 4 Task 2; Plan 5 Task 10; Plan 6 Task 1 |
| 29 versions/compatibility | Plan 1 Task 1; Plan 2 Task 9; Plan 3 Tasks 1, 8, 11 |
| 30 test strategy | All plans; Plan 6 CI |
| 31 acceptance criteria | Plan 6 Tasks 8–9 |
| 32 future expansion | Preserved by interface and format versioning; not implemented |
| 33 implementation principles | Enforced throughout all six plans |
| 34 reference sources | Version/tool choices are pinned in Plans 1 and 6; reference-only, no product feature |

## Execution Checkpoints

- [ ] **Checkpoint 1: Domain review**

Review public record shapes, JSON discriminators, issue/status names, and aggregation truth tables before starting persistence.

- [ ] **Checkpoint 2: Container review**

Open committed 1.0 fixtures with an external ZIP viewer, inspect that paths are ASCII and source paths are absent, then confirm security tests reject malicious archives.

- [ ] **Checkpoint 3: Contract review**

Review golden `output-schema.json`, generated Python, valid example, invalid fixture, prompts, and manifest together. A reviewer must confirm they share one fingerprint and no unsupported schema/Python dependency exists.

- [ ] **Checkpoint 4: Headless workflow review**

Run the full application workflow without WPF and inspect preflight codes, dirty-state guards, and generated package self-test.

- [ ] **Checkpoint 5: UI review**

Complete wizard/workspace/template/preflight keyboard walkthroughs at 100%, 150%, and 200% display scaling.

- [ ] **Checkpoint 6: Release review**

Run clean Windows Sandbox acceptance, verify one-file output, offline operation, read-only-folder launch, privacy redaction, and all 17 MVP acceptance criteria.

## Definition of Done

Implementation is complete only when every detailed plan completion gate passes and the following command sequence exits `0` on Windows 11:

```powershell
./eng/restore.ps1
./eng/test.ps1
./eng/publish.ps1
./eng/verify-publish.ps1
./eng/verify-no-network.ps1
```

The release artifact must be:

```text
artifacts/publish/win-x64/CheckListMaker.exe
```

No tag or release should be created from this roadmap automatically. Complete the release checklist and explicitly approve the release after implementation review.
