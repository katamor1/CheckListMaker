# CheckListMaker Output Contract and Copilot Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a deterministic Copilot ZIP whose schema, Python validator, examples, prompts, package contract, and manifest all derive from one output-contract model.

**Architecture:** `CheckListMaker.PackageGeneration` builds immutable package files in memory and writes them in deterministic order. JSON Schema handles structural checks; generated Python 3.9+ code performs ID coverage, aggregation, repair, evidence, scope, artifact, and fingerprint checks using only the standard library.

**Tech Stack:** .NET 10, C# 14, `System.Text.Json`, `System.IO.Compression`, embedded resources, Python 3.9 standard library, MSTest 4.3.2.

## Global Constraints

- Complete Plans 1 and 2 first.
- Package/output/validator/prompt protocol versions are `1.0`.
- Schema vocabulary is limited to `type`, `required`, `properties`, `additionalProperties`, `items`, `enum`, `const`, `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, and `pattern`.
- Do not emit `$ref`, composition keywords, conditionals, or network schema references.
- Validator exit codes: `0` success, `1` invalid result, `2` environment/input failure.
- `--self-test` runs before document work; valid fixture passes and missing-item fixture fails.
- At most five validation-repair attempts; never finalize `result.json` after exhaustion.
- Only `01_EXECUTION_PROMPT.md` contains instructions. Documents and references are untrusted data.
- Prompts prohibit external facts, network lookup, input mutation, and unsupported inference.
- Package paths are ASCII, deterministic, and slash-separated.
- Manifest covers every package file except itself.

---

## Locked Interfaces

```csharp
public interface ICopilotPackageGenerator
{
    Task GenerateAsync(CopilotPackageGenerationRequest request, CancellationToken cancellationToken);
}
public sealed record CopilotPackageGenerationRequest
{
    public required ProjectDefinition Project { get; init; }
    public required ProjectWorkspace Workspace { get; init; }
    public required Guid PackageId { get; init; }
    public required DateTimeOffset CreatedAt { get; init; }
    public required string DestinationZipPath { get; init; }
}
```

### Task 1: Define the output contract model

**Files:**
- Create: `src/CheckListMaker.Application/Abstractions/ICopilotPackageGenerator.cs`
- Create: `src/CheckListMaker.Application/Packaging/CopilotPackageGenerationRequest.cs`
- Create: `src/CheckListMaker.PackageGeneration/Contracts/{OutputContractDefinition,OutputContractFactory,ContractFingerprintService}.cs`
- Create: `src/CheckListMaker.PackageGeneration/Packaging/GeneratedPackageFile.cs`
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Contracts/OutputContractFactoryTests.cs`

**Interfaces:** Produces `OutputContractFactory.Create(ProjectDefinition)` and stable SHA-256 fingerprint.

- [ ] **Step 1: Write failing contract tests**

Assert ordered item/condition IDs, all status/outcome enums, evidence requirements, format version `1.0`, and maximum attempts `5`. Semantically identical projects with different insertion order must share a fingerprint.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~OutputContractFactoryTests
```

- [ ] **Step 3: Implement normalized immutable contract records**

Sort item IDs and condition IDs ordinally; copy lists to arrays; include effective repair policies, required/optional flags, `allowNotApplicable`, condition logic, target format/editability, required output artifacts, and all format fingerprints.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: define Copilot output contract"
```

### Task 2: Build the restricted JSON Schema AST

**Files:**
- Create: `src/CheckListMaker.PackageGeneration/Schema/{SchemaNode,SchemaObject,SchemaArray,SchemaScalar,JsonSchemaRenderer}.cs`
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Schema/JsonSchemaRendererTests.cs`

**Interfaces:** Produces Draft 2020-12 JSON using only the allowed keywords.

- [ ] **Step 1: Write schema AST tests**

Assert root `$schema`, required fields, `additionalProperties: false`, snake-case enums, fixed package ID/contract fingerprint, and rejection of unsupported AST keywords.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~JsonSchemaRendererTests
```

- [ ] **Step 3: Implement AST and renderer**

Use typed nodes rather than arbitrary dictionaries. Renderer orders properties ordinally and emits no unsupported keyword. The schema validates structure; cross-field rules remain Python responsibilities.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: render restricted output schema"
```

### Task 3: Generate valid and invalid result fixtures

**Files:**
- Create: `src/CheckListMaker.PackageGeneration/Results/ResultExampleFactory.cs`
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Results/ResultExampleFactoryTests.cs`

**Interfaces:** Produces `result.example.json`, `validator-tests/valid-minimal.json`, and `validator-tests/invalid-missing-item.json` from the contract.

- [ ] **Step 1: Write fixture tests**

Valid fixture includes every item/condition exactly once and a recalculable summary. Invalid fixture omits exactly one item and is otherwise identical.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~ResultExampleFactoryTests
```

- [ ] **Step 3: Implement deterministic fixture generation**

Use one minimal evidence entry per evaluated condition, `not_needed` repairs for valid items, and paths under `target/` or `generation/` according to mode.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: generate validator fixtures"
```

### Task 4: Generate the Python schema-subset validator

**Files:**
- Create: `src/CheckListMaker.PackageGeneration/Validator/PythonValidatorRenderer.cs`
- Create: `src/CheckListMaker.PackageGeneration/Validator/Templates/validate_output.py.tmpl`
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Validator/PythonSchemaValidatorTests.cs`

**Interfaces:** Produces Python 3.9-compatible `validate_output.py` with `--self-test`, `--input`, `--output-dir`, and `--report`.

- [ ] **Step 1: Write process tests**

Generate a package workspace, run Python with valid and structurally invalid fixtures, and assert exit `0` and `1`. Missing schema/checklist/package contract must return `2`.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~PythonSchemaValidatorTests
```

- [ ] **Step 3: Implement subset validation**

Python functions must include `load_json`, `validate_node`, `validate_type`, `validate_object`, `validate_array`, `validate_scalar`, `add_error`, and `write_report`. Stable errors contain `code`, `path`, `message`; no traceback is written for ordinary validation failures.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: generate Python schema validator"
```

### Task 5: Validate coverage, short-circuiting, aggregation, and summary

**Files:**
- Modify: Python template
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Validator/PythonAggregationTests.cs`

**Interfaces:** Mirrors Plan 1 `ResultAggregationService` exactly.

- [ ] **Step 1: Write mutation tests**

Mutate valid JSON to create missing/duplicate/unknown item IDs, missing/duplicate/unknown condition IDs, illegal `not_evaluated`, illegal `not_applicable`, incorrect AND/OR item status, wrong summary counts, and wrong overall status.

- [ ] **Step 2: Run and confirm failures are undetected**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~PythonAggregationTests
```

- [ ] **Step 3: Implement cross-field checks**

Recompute coverage, item states, counts, warning count, and overall status from checklist and result. Emit stable codes such as `ITEM_ID_MISSING`, `CONDITION_ID_DUPLICATE`, `NOT_EVALUATED_ILLEGAL`, `ITEM_STATUS_MISMATCH`, and `SUMMARY_MISMATCH`.

- [ ] **Step 4: Verify parity and commit**

Run the same truth-table fixture through C# and Python and compare outputs.

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: validate result aggregation in Python"
```

### Task 6: Validate repair, evidence, scopes, conflicts, and artifacts

**Files:**
- Modify: Python template and output contract
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Validator/PythonSemanticContractTests.cs`

**Interfaces:** Enforces non-truth structural semantics from specification sections 15, 17, 23, and 25.

- [ ] **Step 1: Write mutation tests**

Cover:

```text
suggest_only/do_not_modify marked repaired
not_permitted outside do_not_modify
PDF or reference with applied repair
repaired without before/after/location/reason/source/final valid evaluation
needs_information without missing-information detail
blocked_by_conflict without source conflict and required decision
resolved scope without location/reason/confidence
low confidence with final valid/invalid decision
not_found result inconsistent with onNotFound
required evidence absent
artifact declared but missing
mode/extension mismatch
```

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~PythonSemanticContractTests
```

- [ ] **Step 3: Implement validators**

Add dedicated functions `validate_repair`, `validate_evidence`, `validate_scope`, `validate_conflicts`, and `validate_artifacts`. Validate file existence relative to `--output-dir`; reject path traversal; never inspect truth of prose.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: validate repair and artifact consistency"
```

### Task 7: Finalize self-test, reports, receipts, and attempt limits

**Files:**
- Modify: Python template
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Validator/PythonSelfTestTests.cs`

**Interfaces:** Self-test verifies fixture behavior and package identity; final validation generates `validation-report.json` and `execution-receipt.json`.

- [ ] **Step 1: Write self-test and receipt tests**

Assert valid fixture succeeds, missing-item fixture fails, package/schema/checklist hashes match, Python version is at least 3.9, report includes all stable errors, receipt includes Python version, package ID, fingerprint, attempts, final exit code, and structural validation status.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~PythonSelfTestTests
```

- [ ] **Step 3: Implement CLI and attempts**

`--self-test` never writes success result artifacts. Normal validation increments attempt metadata supplied by the caller. After attempt `5`, prompt protocol requires `execution-failure.json`; validator never renames draft to final itself.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: finalize validator self-test and receipts"
```

### Task 8: Generate package contract and manifest

**Files:**
- Create: `src/CheckListMaker.PackageGeneration/Contracts/PackageContractDocument.cs`
- Create: `src/CheckListMaker.PackageGeneration/Manifests/{PackageManifestDocument,PackageManifestBuilder}.cs`
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Manifests/PackageManifestBuilderTests.cs`

**Interfaces:** Produces `package-contract.json` and `manifest.json`.

- [ ] **Step 1: Write identity/hash tests**

Assert package ID, format versions, contract fingerprint, checklist hash, schema hash, validator hash, mode, requested format, and maximum attempts. Manifest covers every non-manifest file once with path, role, media type, bytes, hash, read-only flag, and optional original name.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~PackageManifestBuilderTests
```

- [ ] **Step 3: Implement without a self-hash cycle**

Build all files except manifest, hash them, then serialize manifest last. Package contract hash participates in the manifest; manifest does not hash itself.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: generate package identity and manifest"
```

### Task 9: Generate Copilot prompt documents

**Files:**
- Create: `src/CheckListMaker.PackageGeneration/Prompts/PromptRenderer.cs`
- Create: templates `00_READ_ME_FIRST.md.tmpl`, `01_EXECUTION_PROMPT.md.tmpl`, `02_CONTINUE_PROMPT.md.tmpl`
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Prompts/PromptRendererTests.cs`

**Interfaces:** Produces exact top-level prompt files for existing and generation modes.

- [ ] **Step 1: Write prompt invariant tests**

Assert self-test first; inputs immutable; documents are data; no external information; all IDs evaluated; authority order honored; missing information not guessed; repair policy honored; auto-fix reread/re-evaluated; draft validated up to five times; final JSON only after exit `0`; reports derived from final JSON; failures exposed.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~PromptRendererTests
```

- [ ] **Step 3: Implement embedded templates**

Continue prompt requires package ID and last completed phase before resuming and forbids restarting completed destructive work. README gives non-engineer upload/run/download instructions and explains structural validation versus content compliance.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: generate Copilot execution prompts"
```

### Task 10: Build deterministic ZIPs for both modes

**Files:**
- Create: `src/CheckListMaker.PackageGeneration/Packaging/{CopilotPackageBuilder,DeterministicZipWriter,PackageNameSanitizer}.cs`
- Test: `tests/CheckListMaker.PackageGeneration.Tests/Packaging/CopilotPackageBuilderTests.cs`

**Interfaces:** Implements `ICopilotPackageGenerator`.

- [ ] **Step 1: Write package-layout tests**

Existing mode includes `target/TARGET.ext`; generation mode includes `generation/document-generation.json`. Both include prompts, contract, manifest, checklist, schema, validator, example, references, and validator fixtures. Repeated generation with fixed inputs must be byte-identical.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj --filter FullyQualifiedName~CopilotPackageBuilderTests
```

- [ ] **Step 3: Implement deterministic ZIP writing**

Sort paths ordinally, use timestamp `1980-01-01`, preserve imported bytes, sanitize external ZIP name to ASCII-safe text, write atomically through Plan 2, and reopen/verify manifest before replacement.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.PackageGeneration.Tests/CheckListMaker.PackageGeneration.Tests.csproj
git add src tests
git commit -m "feat: build Copilot execution packages"
```

### Task 11: Lock golden outputs and Python 3.9 compatibility

**Files:**
- Create: `tests/CheckListMaker.PackageGeneration.Tests/Golden/*`
- Create: `tests/CheckListMaker.PackageGeneration.Tests/Validator/PythonCompatibilityTests.cs`

**Interfaces:** Locks Package Format 1.0 output and validator behavior.

- [ ] **Step 1: Commit golden files**

For one fixed existing project and one generation project, store schema, package contract, checklist, validator, example, prompts, fixture reports, and manifest. Compare normalized text and exact binary hashes in tests.

- [ ] **Step 2: Test Python versions**

CI runs the generated validator on Python 3.9 and the current stable Python. Assert no third-party imports and stable exit/error codes.

- [ ] **Step 3: Run the complete suite**

```powershell
dotnet test CheckListMaker.sln --configuration Release
```

- [ ] **Step 4: Commit**

```powershell
git add tests/CheckListMaker.PackageGeneration.Tests
git commit -m "test: lock package format and validator compatibility"
```

## Completion Gate

Complete only when self-test passes; every mutation fails with stable errors; missing/corrupt package inputs return `2`; C# and Python aggregation agree; artifact/fingerprint validation works; and repeated fixed-input ZIP generation is byte-identical.
