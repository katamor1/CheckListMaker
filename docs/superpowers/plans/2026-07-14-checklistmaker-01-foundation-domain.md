# CheckListMaker Foundation and Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the .NET 10 solution and lock the domain contracts for projects, references, checklists, conditions, scopes, repair policies, and deterministic result aggregation.

**Architecture:** `CheckListMaker.Domain` is dependency-free and owns stable business records and rules. Application, persistence, package generation, and WPF depend inward on these contracts; the domain project must not reference WPF, filesystem, ZIP, network, or AI APIs.

**Tech Stack:** .NET 10, C# 14, `System.Text.Json`, WPF scaffold, MSTest 4.3.2.

## Global Constraints

- Windows 11 x64 is the only supported runtime platform.
- Library projects target `net10.0`; WPF projects target `net10.0-windows`.
- Production projects use no runtime third-party packages.
- JSON properties use camelCase; enum values use snake_case.
- All format/protocol versions start at `1.0`.
- Default repair policy is `suggest_only`.
- Authority order is `binding > approved > working > reference`; priority is `0..100`, default `50`.
- Condition grouping supports one level of `all` or `any`, never nested groups.
- No AI calls, browser automation, encryption, PDF editing, network access, or result re-import.

---

## Locked Structure

```text
CheckListMaker.sln
global.json
Directory.Build.props
Directory.Packages.props
src/CheckListMaker.{App,Application,Domain,Infrastructure,PackageGeneration}/
tests/CheckListMaker.{App,Domain,Infrastructure,PackageGeneration}.Tests/
```

### Task 1: Scaffold and pin the solution

**Files:**
- Create: `CheckListMaker.sln`, `global.json`, `Directory.Build.props`, `Directory.Packages.props`, `.editorconfig`
- Create: all nine projects above
- Create: `src/CheckListMaker.Domain/Formats/FormatVersions.cs`
- Test: `tests/CheckListMaker.Domain.Tests/Formats/FormatVersionsTests.cs`

**Interfaces:**
- Produces: `FormatVersions.Project`, `Template`, `Package`, `Output`, `Validator`, `PromptProtocol`.

- [ ] **Step 1: Scaffold projects and references**

```powershell
dotnet new sln -n CheckListMaker --format sln
dotnet new classlib -n CheckListMaker.Domain -f net10.0 -o src/CheckListMaker.Domain
dotnet new classlib -n CheckListMaker.Application -f net10.0 -o src/CheckListMaker.Application
dotnet new classlib -n CheckListMaker.Infrastructure -f net10.0 -o src/CheckListMaker.Infrastructure
dotnet new classlib -n CheckListMaker.PackageGeneration -f net10.0 -o src/CheckListMaker.PackageGeneration
dotnet new wpf -n CheckListMaker.App -f net10.0 -o src/CheckListMaker.App
dotnet new mstest -n CheckListMaker.Domain.Tests -f net10.0 -o tests/CheckListMaker.Domain.Tests
dotnet new mstest -n CheckListMaker.Infrastructure.Tests -f net10.0 -o tests/CheckListMaker.Infrastructure.Tests
dotnet new mstest -n CheckListMaker.PackageGeneration.Tests -f net10.0 -o tests/CheckListMaker.PackageGeneration.Tests
dotnet new mstest -n CheckListMaker.App.Tests -f net10.0-windows -o tests/CheckListMaker.App.Tests
```

Add all projects to the solution. Reference Domain from Application; Domain and Application from Infrastructure and PackageGeneration; all four from App. Test projects reference their corresponding production project.

- [ ] **Step 2: Write the failing version test**

```csharp
[TestMethod]
public void AllMvpVersionsAreOnePointZero()
{
    CollectionAssert.AreEqual(
        new[] { "1.0", "1.0", "1.0", "1.0", "1.0", "1.0" },
        new[] { FormatVersions.Project, FormatVersions.Template, FormatVersions.Package,
                FormatVersions.Output, FormatVersions.Validator, FormatVersions.PromptProtocol });
}
```

- [ ] **Step 3: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj --filter FullyQualifiedName~FormatVersionsTests
```

Expected: compilation fails because `FormatVersions` is absent.

- [ ] **Step 4: Implement build settings and version constants**

`global.json` pins `10.0.100` with `rollForward: latestFeature`. `Directory.Packages.props` centrally pins `MSTest` to `4.3.2`. `Directory.Build.props` enables C# 14, nullable, implicit usings, deterministic builds, package lock files, latest recommended analysis, and warnings as errors.

```csharp
public static class FormatVersions
{
    public const string Project = "1.0";
    public const string Template = "1.0";
    public const string Package = "1.0";
    public const string Output = "1.0";
    public const string Validator = "1.0";
    public const string PromptProtocol = "1.0";
}
```

- [ ] **Step 5: Verify and commit**

```powershell
dotnet restore CheckListMaker.sln --use-lock-file
dotnet test CheckListMaker.sln --no-restore
git add .
git commit -m "build: scaffold CheckListMaker solution"
```

### Task 2: Add identifiers, enums, and validation primitives

**Files:**
- Create: `src/CheckListMaker.Domain/{Projects,References,Repairs,Checklists,Validation}/*.cs`
- Test: `tests/CheckListMaker.Domain.Tests/Checklists/IdentifierRulesTests.cs`

**Interfaces:**
- Produces: `IdentifierRules.IsCheckItemId`, `IsConditionId`, `IsReferenceId`; `ValidationResult.FromIssues`.

- [ ] **Step 1: Write failing ID tests**

```csharp
[DataTestMethod]
[DataRow("CHK-0001", true)] [DataRow("CHK-001", false)]
public void CheckIds(string value, bool expected) => Assert.AreEqual(expected, IdentifierRules.IsCheckItemId(value));
```

Add equivalent tests for `COND-01` and `REF-001`.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj --filter FullyQualifiedName~IdentifierRulesTests
```

- [ ] **Step 3: Implement exact enums and regexes**

```csharp
public enum ProjectMode { ExistingDocument, DocumentGeneration }
public enum DocumentFormat { Markdown, Text, Docx, Pdf }
public enum AuthorityLevel { Reference = 0, Working = 1, Approved = 2, Binding = 3 }
public enum RepairPolicy { AutoFix, SuggestOnly, DoNotModify }
public enum ConditionLogic { All, Any }
```

Use generated regexes `^CHK-[0-9]{4}$`, `^COND-[0-9]{2}$`, and `^REF-[0-9]{3}$`. `DomainIssue` contains `Code`, `Severity`, `Path`, and Japanese `Message`; `ValidationResult.IsValid` is false when any issue is an error.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj
git add src/CheckListMaker.Domain tests/CheckListMaker.Domain.Tests
git commit -m "feat: add domain identifiers and enums"
```

### Task 3: Model projects, imported files, and references

**Files:**
- Create: `src/CheckListMaker.Domain/Projects/*.cs`
- Create: `src/CheckListMaker.Domain/References/*.cs`
- Create: `src/CheckListMaker.Domain/Checklists/{ChecklistDefinition,CheckItemDefinition,ChecklistOrigin}.cs`
- Test: `tests/CheckListMaker.Domain.Tests/Projects/ProjectDefinitionTests.cs`

**Interfaces:**
- Produces: `ProjectDefinition`, `ImportedFileDefinition`, `TargetDocumentDefinition`, `DocumentGenerationDefinition`, `ReferenceDocumentDefinition`, `ReferenceRoleDefinition`.

- [ ] **Step 1: Write mode-invariant tests**

```csharp
[TestMethod]
public void ExistingModeRequiresTargetAndRejectsGeneration()
{
    ProjectDefinition project = Samples.ValidExisting() with { Target = null, Generation = Samples.Generation() };
    string[] codes = project.ValidateMode().Issues.Select(x => x.Code).ToArray();
    CollectionAssert.Contains(codes, "PROJECT_TARGET_REQUIRED");
    CollectionAssert.Contains(codes, "PROJECT_GENERATION_FORBIDDEN");
}
```

Add generation-mode tests including rejection of PDF output.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj --filter FullyQualifiedName~ProjectDefinitionTests
```

- [ ] **Step 3: Implement immutable records**

`ImportedFileDefinition` stores only original base name, ASCII stored path, media type, byte size, lowercase SHA-256, and import timestamp. `ProjectDefinition` contains one target or one generation definition according to mode, references, checklist, origin, and default repair policy. `ReferenceDocumentDefinition.Priority` defaults to `50`; references expose role IDs and are always read-only.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj
git add src/CheckListMaker.Domain tests/CheckListMaker.Domain.Tests
git commit -m "feat: model projects and source documents"
```

### Task 4: Implement four scopes and nine condition types

**Files:**
- Create: `src/CheckListMaker.Domain/Scopes/*.cs`
- Create: `src/CheckListMaker.Domain/Conditions/*.cs`
- Create: `src/CheckListMaker.Domain/Serialization/DomainJson.cs`
- Test: `tests/CheckListMaker.Domain.Tests/Serialization/ConditionSerializationTests.cs`

**Interfaces:**
- Produces: polymorphic `ScopeDefinition` and `ConditionDefinition` contracts; `DomainJson.CreateOptions()`.

- [ ] **Step 1: Write a nine-type JSON round-trip test**

Construct one instance each of `semantic`, `required_text`, `forbidden_text`, `number`, `length_or_count`, `date_or_deadline`, `pattern`, `one_of`, and `cross_source_consistency`; serialize and deserialize the array and assert all concrete types return.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj --filter FullyQualifiedName~ConditionSerializationTests
```

- [ ] **Step 3: Implement polymorphism**

Use `[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]` and these discriminators:

```text
Scopes: entire_document, section, table, semantic_locator
Conditions: semantic, required_text, forbidden_text, number, length_or_count,
            date_or_deadline, pattern, one_of, cross_source_consistency
```

`DomainJson.CreateOptions()` uses camelCase, snake_case enum strings, `WhenWritingNull`, and `UnmappedMemberHandling.Disallow`.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj
git add src/CheckListMaker.Domain tests/CheckListMaker.Domain.Tests
git commit -m "feat: add checklist conditions and scopes"
```

### Task 5: Validate checklist definitions

**Files:**
- Create: `src/CheckListMaker.Domain/Checklists/ChecklistDefinitionValidator.cs`
- Test: `tests/CheckListMaker.Domain.Tests/Checklists/ChecklistDefinitionValidatorTests.cs`

**Interfaces:**
- Produces: `ChecklistDefinitionValidator.Validate(ChecklistDefinition, IReadOnlyList<ReferenceDocumentDefinition>)`.

- [ ] **Step 1: Write failing tests for stable issue codes**

Cover duplicate/invalid/reused item and condition IDs, empty groups, missing required values, unknown source IDs, priority outside `0..100`, invalid numeric ranges, missing dates, unsupported regex constructs, and the required-plus-not-applicable warning.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj --filter FullyQualifiedName~ChecklistDefinitionValidatorTests
```

- [ ] **Step 3: Implement deterministic validation**

Reject regex features with material .NET/Python differences: lookbehind, backreferences, conditionals, and variable-length constructs. Return issues ordered by path then code. Warning issues do not make `ValidationResult.IsValid` false.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj
git add src/CheckListMaker.Domain tests/CheckListMaker.Domain.Tests
git commit -m "feat: validate checklist definitions"
```

### Task 6: Resolve repair policy and reference precedence

**Files:**
- Create: `src/CheckListMaker.Domain/Repairs/RepairPolicyResolver.cs`
- Create: `src/CheckListMaker.Domain/References/ReferencePrecedenceComparer.cs`
- Test: corresponding tests under `tests/CheckListMaker.Domain.Tests/`

**Interfaces:**
- Produces: `RepairPolicy Resolve(ProjectDefinition, CheckItemDefinition)`; authority-first comparer and tie detection.

- [ ] **Step 1: Write failing inheritance and precedence tests**

Assert item policy overrides project default, missing override inherits `SuggestOnly`, and `Binding/0` outranks `Approved/100`.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj --filter "FullyQualifiedName~RepairPolicyResolverTests|FullyQualifiedName~ReferencePrecedenceComparerTests"
```

- [ ] **Step 3: Implement minimal services**

```csharp
public static RepairPolicy Resolve(ProjectDefinition p, CheckItemDefinition i) => i.RepairPolicy ?? p.DefaultRepairPolicy;
```

Comparer sorts higher authority first, then higher numeric priority, then ID ordinally. A conflict tie exists only when authority and priority are equal.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj
git add src/CheckListMaker.Domain tests/CheckListMaker.Domain.Tests
git commit -m "feat: resolve repair and reference precedence"
```

### Task 7: Aggregate condition, item, and overall results

**Files:**
- Create: `src/CheckListMaker.Domain/Results/*.cs`
- Test: `tests/CheckListMaker.Domain.Tests/Results/ResultAggregationServiceTests.cs`

**Interfaces:**
- Produces: `AggregateItem(ConditionLogic, IReadOnlyList<ConditionDecision>)` and `AggregateOverall(IReadOnlyList<ItemDecision>)`.

- [ ] **Step 1: Write the full truth-table tests**

Test all AND/OR combinations from the specification and overall precedence: required invalid → failed; otherwise required needs-information → needs_information; optional issues → passed_with_warnings; otherwise passed. `Repaired` counts as satisfied.

- [ ] **Step 2: Run and confirm failure**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj --filter FullyQualifiedName~ResultAggregationServiceTests
```

- [ ] **Step 3: Implement statuses, summary, and aggregation**

Use condition statuses `valid`, `invalid`, `needs_information`, `not_evaluated`; item statuses `valid`, `invalid`, `repaired`, `needs_information`, `not_applicable`; overall statuses `passed`, `passed_with_warnings`, `failed`, `needs_information`. Reject empty condition groups.

- [ ] **Step 4: Verify and commit**

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj
git add src/CheckListMaker.Domain tests/CheckListMaker.Domain.Tests
git commit -m "feat: aggregate checklist results"
```

### Task 8: Lock the complete JSON contract

**Files:**
- Create: `tests/CheckListMaker.Domain.Tests/Fixtures/complete-project.json`
- Create: `tests/CheckListMaker.Domain.Tests/Serialization/ProjectContractRoundTripTests.cs`

**Interfaces:**
- Locks all public JSON names and discriminators used by every later plan.

- [ ] **Step 1: Create a complete fixture**

Include all nine condition types, four scopes, both condition logics, inherited and overridden repair policy, two authority levels, a required reference role, DOCX target, and imported-template origin.

- [ ] **Step 2: Write and run the round-trip test**

Canonicalize the first serialization and the reserialization and compare bytes rather than relying on list record equality.

```powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj --filter FullyQualifiedName~ProjectContractRoundTripTests
```

- [ ] **Step 3: Fix only contract metadata and rerun all checks**

```powershell
dotnet test CheckListMaker.sln --configuration Release
dotnet build CheckListMaker.sln --configuration Release
```

Expected: all tests pass with zero warnings.

- [ ] **Step 4: Commit**

```powershell
git add src/CheckListMaker.Domain tests/CheckListMaker.Domain.Tests
git commit -m "test: lock domain JSON contract"
```

## Completion Gate

```powershell
dotnet restore CheckListMaker.sln --locked-mode
dotnet test CheckListMaker.sln --configuration Release --no-restore
dotnet build CheckListMaker.sln --configuration Release --no-restore
```

Complete only when all commands exit `0`, the fixture round-trips byte-stably, and Domain contains no references to WPF, filesystem, ZIP, network, or package-generation APIs.
