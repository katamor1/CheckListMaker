# CheckListMaker Demo Sample Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register a non-sensitive Japanese machine-control design-review sample that is understandable to people, mechanically verifiable with Python, and reusable as the complete Domain JSON contract fixture.

**Architecture:** Keep human-facing sample assets under `samples/` and the current Domain contract fixture under `tests/CheckListMaker.Domain.Tests/Fixtures/`. A Python 3.9 standard-library validator is the authoritative catalog verifier; developer-only document builders create deterministic DOCX/PDF inputs, and MSTest locks the approved condition-ID and decimal-serialization contracts.

**Tech Stack:** .NET 10, C# 14, MSTest 4.3.2, Python 3.9+ standard library, python-docx 1.2.0, ReportLab 4.4.9, pypdf 6.10.0, LibreOffice, Poppler.

## Global Constraints

- Work on `agent/implement-checklistmaker-mvp` and preserve unrelated user changes.
- All sample names and facts are invented; do not copy real product, customer, employee, or internal-policy text.
- Repository paths are ASCII POSIX paths. Japanese appears in display metadata and document contents.
- Register both `existing_document` and `document_generation` modes.
- Include MD, TXT, DOCX, and PDF inputs; PDF remains evaluation/reference-only and is never described as editable.
- References are read-only and use `binding > approved > working > reference` precedence before numeric priority.
- Use all nine condition types, all four scope types, `all` and `any` logic, and inherited/`auto_fix`/`suggest_only`/`do_not_modify` policies.
- Condition IDs use `COND-0001`; check items use `CHK-0001`; references use `REF-001`.
- JSON is UTF-8, LF, two-space indented, ends with one newline, rejects duplicate keys, and never relies on network schema references.
- `samples/validate_samples.py` uses only the Python 3.9 standard library and never writes the sample tree.
- DOCX/PDF authoring dependencies are development-only and must not enter a production `.csproj` or published application.
- Do not hand-author `.clmproj`, `.clmcheck`, Copilot execution ZIPs, or final `result.json` files.
- Run failing tests before production changes. If .NET 10 is unavailable, do not make the corresponding C# production change until the RED test has run in a .NET 10 environment.
- Render and inspect every DOCX/PDF page before committing binary documents. Do not commit render PNGs or QA PDFs.
- The root agent reviews every task commit and publishes accepted commits to the existing remote branch; implementer agents do not push.

---

### Task 1: Align the Domain identifiers and decimal JSON needed by the fixture

**Files:**
- Create: `tests/CheckListMaker.Domain.Tests/Checklists/IdentifierRulesTests.cs`
- Create: `tests/CheckListMaker.Domain.Tests/Conditions/NumberConditionSerializationTests.cs`
- Create: `src/CheckListMaker.Domain/Serialization/NormalizedNullableDecimalStringConverter.cs`
- Modify: `src/CheckListMaker.Domain/Validation/ValidationPrimitives.cs`
- Modify: `src/CheckListMaker.Domain/Conditions/ConditionDefinitions.cs`
- Modify: `docs/superpowers/plans/2026-07-14-checklistmaker-01-foundation-domain.md`
- Modify: `docs/superpowers/plans/2026-07-14-checklistmaker-05-wpf-ui.md`

**Interfaces:**
- Produces: `IdentifierRules.IsConditionId(string?)` accepting only `COND-####`.
- Produces: `NormalizedNullableDecimalStringConverter : JsonConverter<decimal?>`.
- Preserves: `NumberCondition.Value`, `Minimum`, and `Maximum` as nullable decimals in C# while serializing normalized JSON strings.

- [ ] **Step 1: Write the failing identifier test**

~~~csharp
using CheckListMaker.Domain.Validation;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace CheckListMaker.Domain.Tests.Checklists;

[TestClass]
public sealed class IdentifierRulesTests
{
    [DataTestMethod]
    [DataRow("COND-0001", true)]
    [DataRow("COND-9999", true)]
    [DataRow("COND-01", false)]
    [DataRow("COND-001", false)]
    [DataRow("COND-00001", false)]
    [DataRow("cond-0001", false)]
    [DataRow("", false)]
    public void IsConditionId_RequiresCondPrefixAndFourDigits(
        string value,
        bool expected)
    {
        Assert.AreEqual(expected, IdentifierRules.IsConditionId(value));
    }

    [TestMethod]
    public void IsConditionId_NullIsInvalid()
    {
        Assert.IsFalse(IdentifierRules.IsConditionId(null));
    }
}
~~~

- [ ] **Step 2: Write the failing decimal serialization tests**

~~~csharp
using System.Text.Json;
using CheckListMaker.Domain.Conditions;
using CheckListMaker.Domain.Scopes;
using CheckListMaker.Domain.Serialization;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace CheckListMaker.Domain.Tests.Conditions;

[TestClass]
public sealed class NumberConditionSerializationTests
{
    private static readonly JsonSerializerOptions Options =
        DomainJson.CreateOptions();

    [TestMethod]
    public void DecimalValues_AreWrittenAsNormalizedStrings()
    {
        var condition = new NumberCondition
        {
            Id = "COND-0001",
            Scope = new EntireDocumentScope(),
            Subject = "監視周期",
            Operator = NumericOperator.Between,
            Minimum = 12.500m,
            Maximum = 250m,
            Unit = "ms"
        };

        string json = JsonSerializer.Serialize(condition, Options);

        StringAssert.Contains(json, "\"minimum\":\"12.5\"");
        StringAssert.Contains(json, "\"maximum\":\"250\"");
    }

    [TestMethod]
    public void DecimalValues_ReadNormalizedStrings()
    {
        const string json =
            "{\"id\":\"COND-0001\",\"scope\":{\"type\":\"entire_document\"}," +
            "\"subject\":\"監視周期\",\"operator\":\"less_than_or_equal\"," +
            "\"value\":\"250\",\"unit\":\"ms\"}";

        NumberCondition? condition =
            JsonSerializer.Deserialize<NumberCondition>(json, Options);

        Assert.IsNotNull(condition);
        Assert.AreEqual(250m, condition.Value);
    }

    [DataTestMethod]
    [DataRow("{\"value\":250}")]
    [DataRow("{\"value\":\"0250\"}")]
    [DataRow("{\"value\":\"250.0\"}")]
    public void DecimalValues_RejectNumbersAndNonCanonicalStrings(
        string valueFragment)
    {
        string json =
            "{\"id\":\"COND-0001\",\"scope\":{\"type\":\"entire_document\"}," +
            "\"subject\":\"監視周期\",\"operator\":\"equal\"," +
            valueFragment[1..^1] + "}";

        Assert.ThrowsException<JsonException>(
            () => JsonSerializer.Deserialize<NumberCondition>(json, Options));
    }
}
~~~

- [ ] **Step 3: Run the focused tests and verify RED**

~~~powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj `
  --filter "FullyQualifiedName~IdentifierRulesTests|FullyQualifiedName~NumberConditionSerializationTests"
~~~

Expected: the identifier case `COND-0001` fails because the current regex accepts two digits, and the decimal tests fail because values are numeric JSON tokens.

- [ ] **Step 4: Implement the four-digit condition regex**

Change only the condition regex:

~~~csharp
[GeneratedRegex("^COND-[0-9]{4}$", RegexOptions.CultureInvariant)]
private static partial Regex ConditionRegex();
~~~

- [ ] **Step 5: Implement normalized nullable-decimal strings**

~~~csharp
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace CheckListMaker.Domain.Serialization;

public sealed class NormalizedNullableDecimalStringConverter
    : JsonConverter<decimal?>
{
    private const string FormatPattern =
        "0.############################";

    public override decimal? Read(
        ref Utf8JsonReader reader,
        Type typeToConvert,
        JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null)
        {
            return null;
        }

        if (reader.TokenType != JsonTokenType.String)
        {
            throw new JsonException(
                "Decimal values must be normalized JSON strings.");
        }

        string raw = reader.GetString() ?? string.Empty;
        const NumberStyles styles =
            NumberStyles.AllowLeadingSign |
            NumberStyles.AllowDecimalPoint;

        if (!decimal.TryParse(
                raw,
                styles,
                CultureInfo.InvariantCulture,
                out decimal value) ||
            !string.Equals(
                raw,
                Format(value),
                StringComparison.Ordinal))
        {
            throw new JsonException(
                "Decimal value is not in canonical form.");
        }

        return value;
    }

    public override void Write(
        Utf8JsonWriter writer,
        decimal? value,
        JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
            return;
        }

        writer.WriteStringValue(Format(value.Value));
    }

    private static string Format(decimal value) =>
        value.ToString(FormatPattern, CultureInfo.InvariantCulture);
}
~~~

Apply `[JsonConverter(typeof(NormalizedNullableDecimalStringConverter))]` to `Value`, `Minimum`, and `Maximum` in `NumberCondition`.
Add `using CheckListMaker.Domain.Serialization;` to `ConditionDefinitions.cs` so all three attributes resolve without fully qualified type names.

- [ ] **Step 6: Correct stale plan examples**

Replace `COND-01` and `COND-##` with `COND-0001` and `COND-####` in the two listed plan documents. Do not change other plan requirements.

- [ ] **Step 7: Run GREEN checks and commit**

~~~powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj `
  --filter "FullyQualifiedName~IdentifierRulesTests|FullyQualifiedName~NumberConditionSerializationTests"
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj
git diff --check
git add src/CheckListMaker.Domain tests/CheckListMaker.Domain.Tests docs/superpowers/plans
git commit -m "fix: align condition JSON contracts"
~~~

Expected: all Domain tests pass with zero warnings.

### Task 2: Add the safe catalog validator core

**Files:**
- Create: `samples/validate_samples.py`
- Create: `tests/sample_catalog/test_validate_samples.py`

**Interfaces:**
- Produces: `ValidationIssue`, `ValidationReport`, `load_json`, `validate_relative_path`, `resolve_regular_file`, `hash_and_size`, `validate_catalog`, and `main`.
- Consumes: `samples/catalog.json` and sample manifests added in Task 6.

- [ ] **Step 1: Write RED tests for JSON and path safety**

Create temporary repositories with `tempfile.TemporaryDirectory` and assert these exact behaviors:

~~~python
class ValidatorCoreTests(unittest.TestCase):
    def test_duplicate_json_key_is_rejected(self):
        root = self.make_repo(
            catalog_text='[{"id":"a","id":"b"}]\n')
        report = validate_catalog(root)
        self.assertEqual(1, report.exit_code)
        self.assertIn(
            "JSON_DUPLICATE_KEY",
            {issue.code for issue in report.issues})

    def test_parent_traversal_manifest_path_is_rejected(self):
        root = self.make_repo(catalog=[{
            "id": "sample-a",
            "manifestPath": "../outside.json",
            "title": "サンプル",
            "description": "説明",
            "modes": ["existing_document"],
            "status": "active"
        }])
        report = validate_catalog(root)
        self.assertIn(
            "PATH_INVALID",
            {issue.code for issue in report.issues})

    def test_windows_reserved_segment_is_rejected(self):
        segments, issues = validate_relative_path(
            "samples/CON/file.json",
            "catalog#/0/manifestPath")
        self.assertIsNone(segments)
        self.assertEqual(["PATH_INVALID"], [issue.code for issue in issues])
~~~

The test helper writes UTF-8/LF JSON with sorted keys, constructs one valid manifest, computes its SHA-256 with `hashlib`, and never depends on committed sample files.

- [ ] **Step 2: Run tests and verify RED**

~~~bash
python3 -m unittest discover -s tests/sample_catalog -p "test_*.py" -v
~~~

Expected: import failure because `samples.validate_samples` does not exist.

- [ ] **Step 3: Implement the validator primitives**

Use these exact public shapes:

~~~python
@dataclass(frozen=True)
class ValidationIssue:
    code: str
    location: str
    message: str
    exit_code: int = 1

@dataclass(frozen=True)
class ValidationReport:
    issues: Tuple[ValidationIssue, ...]
    sample_count: int
    file_count: int

    @property
    def exit_code(self) -> int:
        if any(issue.exit_code == 2 for issue in self.issues):
            return 2
        return 1 if self.issues else 0
~~~

`load_json` must use an `object_pairs_hook` that raises a private `DuplicateKeyError`, distinguish malformed JSON from read failures, and return issues rather than exceptions. `validate_relative_path` must enforce all of these rules:

- ASCII only, nonempty, forward slashes only.
- No absolute, UNC, drive-prefixed, colon-containing, empty, `.`, or `..` segments.
- No segment ending in a dot or space.
- No case-insensitive Windows device name (`CON`, `PRN`, `AUX`, `NUL`, `COM1` through `COM9`, `LPT1` through `LPT9`), including with an extension.

`resolve_regular_file` must `lstat` every component, reject symlinks and non-regular files, resolve strictly, and verify `os.path.commonpath` remains below the supplied root. `hash_and_size` must read in 1 MiB chunks and return the lower-case SHA-256 and byte count.

- [ ] **Step 4: Implement deterministic CLI reporting**

~~~python
def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--root",
        type=Path,
        default=Path(__file__).resolve().parents[1])
    args = parser.parse_args(argv)
    try:
        report = validate_catalog(args.root)
    except OSError:
        print(
            "ERROR INPUT_READ_FAILED samples/catalog.json: "
            "unable to read validator input",
            file=sys.stderr)
        return 2
    except Exception:
        print(
            "ERROR INTERNAL_ERROR samples/catalog.json: "
            "unexpected validator failure",
            file=sys.stderr)
        return 2

    if report.exit_code == 0:
        print(
            f"OK samples={report.sample_count} "
            f"files={report.file_count}")
        return 0

    for issue in report.issues:
        print(
            f"ERROR {issue.code} {issue.location}: {issue.message}",
            file=sys.stderr)
    print(
        f"FAILED samples={report.sample_count} "
        f"files={report.file_count} "
        f"errors={len(report.issues)}",
        file=sys.stderr)
    return report.exit_code
~~~

Sort issues by `(location, code, message)` and never print absolute paths or tracebacks.

- [ ] **Step 5: Run GREEN tests and commit**

~~~bash
python3 -m unittest discover -s tests/sample_catalog -p "test_*.py" -v
git diff --check
git add samples/validate_samples.py tests/sample_catalog
git commit -m "feat: validate sample catalog paths"
~~~

Expected: all validator-core tests pass.

### Task 3: Validate catalog, manifest, files, references, and entry points

**Files:**
- Modify: `samples/validate_samples.py`
- Modify: `tests/sample_catalog/test_validate_samples.py`
- Create: `samples/catalog.schema.json`

**Interfaces:**
- Produces: format 1.0 catalog and manifest validation without a third-party JSON Schema engine.
- Preserves: CLI exit `0` for valid content, `1` for catalog corruption, `2` for environment/input failure.

- [ ] **Step 1: Add failing contract and mutation tests**

Add temporary-repository tests for:

- Missing/unknown properties and wrong JSON types.
- Unsorted or case-insensitively duplicate catalog IDs and manifest paths.
- Catalog/manifest ID, title, description, and mode mismatches.
- Missing, unlisted, duplicate, case-colliding, non-regular, or hash-mismatched files.
- Invalid media type/extension pairs.
- Invalid or duplicate `REF-###` values, duplicate reference paths, unknown entry-point reference IDs.
- Unknown entry-point files and files with the wrong purpose.
- Invalid UTF-8 in `.md`/`.txt` and duplicate keys in `.json` payloads.
- Deterministic issue ordering and no absolute path disclosure.
- CLI success `0`, content error `1`, and read/environment error `2`.

Use the following exact format constants:

~~~python
CATALOG_KEYS = frozenset({
    "id", "manifestPath", "title",
    "description", "modes", "status"
})
MANIFEST_KEYS = frozenset({
    "sampleFormatVersion", "id", "title", "description", "language",
    "entryPoints", "files", "references",
    "expectedJudgments", "demoOperations"
})
MODES = frozenset({"existing_document", "document_generation"})
PURPOSES = frozenset({
    "documentation", "target_document", "expected_outcomes",
    "generation_request", "reference_document"
})
MEDIA_BY_SUFFIX = {
    ".md": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".pdf": "application/pdf",
    ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
AUTHORITY_LEVELS = frozenset({
    "reference", "working", "approved", "binding"
})
~~~

- [ ] **Step 2: Run the expanded suite and verify RED**

~~~bash
python3 -m unittest discover -s tests/sample_catalog -p "test_*.py" -v
~~~

Expected: new tests fail because manifest cross-reference and hash validation are absent.

- [ ] **Step 3: Implement exact catalog and manifest shapes**

`samples/catalog.json` is a top-level array. Each entry has exactly the six `CATALOG_KEYS` fields, ID pattern `^[a-z0-9]+(?:-[a-z0-9]+)*$`, nonempty unique modes, and `status == "active"`. Entries are strictly ascending by ID.

Each manifest has exactly `MANIFEST_KEYS`. It uses `sampleFormatVersion == "1.0"` and `language == "ja"`. `entryPoints` keys exactly equal catalog modes and use these shapes:

~~~json
{
  "existing_document": {
    "targetPath": "existing-document/target/basic-design-before-review.docx",
    "expectedOutcomesPath": "existing-document/expected-outcomes.json",
    "referenceIds": ["REF-001", "REF-002", "REF-003", "REF-004"]
  },
  "document_generation": {
    "requestPath": "generation/document-request.json",
    "referenceIds": ["REF-001", "REF-002", "REF-003", "REF-004"]
  }
}
~~~

Every `files` entry has exactly `path`, `purpose`, `mediaType`, `sha256`, and `sizeBytes`. Every regular file below the manifest directory except `sample-manifest.json` is listed exactly once. Every reference has exactly `id`, `filePath`, `displayName`, `role`, `authorityLevel`, and `priority`.

- [ ] **Step 4: Add stable codes and schema parity**

Use stable content-error codes including `JSON_INVALID`, `JSON_DUPLICATE_KEY`, `PROPERTY_MISSING`, `PROPERTY_UNKNOWN`, `VALUE_INVALID`, `PATH_INVALID`, `PATH_ESCAPE`, `PATH_SYMLINK`, `PATH_CASE_COLLISION`, `FILE_NOT_FOUND`, `FILE_UNLISTED`, `FILE_SIZE_MISMATCH`, `FILE_SHA256_MISMATCH`, `MEDIA_EXTENSION_MISMATCH`, `REFERENCE_ID_INVALID`, `REFERENCE_ID_DUPLICATE`, `REFERENCE_FILE_UNKNOWN`, `ENTRY_POINT_FILE_UNKNOWN`, and `ENTRY_POINT_REFERENCE_UNKNOWN`. Use `CLI_USAGE`, `INPUT_READ_FAILED`, and `INTERNAL_ERROR` only for exit `2`.

`catalog.schema.json` is an editor/documentation contract with `additionalProperties: false`, the exact required keys, ID pattern, mode enum, and active-status constant. Add a test that reads the schema and compares those fields with validator constants. Do not implement a generic JSON Schema engine.

- [ ] **Step 5: Run GREEN tests and commit**

~~~bash
python3 -m unittest discover -s tests/sample_catalog -p "test_*.py" -v
python3 -m py_compile samples/validate_samples.py
git diff --check
git add samples/validate_samples.py samples/catalog.schema.json tests/sample_catalog
git commit -m "feat: validate sample manifests"
~~~

Expected: all mutation, parity, and CLI tests pass.

### Task 4: Add the Japanese narrative and control assets

**Files:**
- Create: `samples/README.md`
- Create: `samples/ja-machine-control-design-review/README.md`
- Create: `samples/ja-machine-control-design-review/references/basic-design-template.md`
- Create: `samples/ja-machine-control-design-review/references/control-terminology.txt`
- Create: `samples/ja-machine-control-design-review/generation/document-request.json`
- Create: `samples/ja-machine-control-design-review/existing-document/expected-outcomes.json`
- Create: `tests/sample_catalog/test_sample_content.py`

**Interfaces:**
- Produces: human-readable scenario instructions and machine-readable generation/expectation controls.
- Consumes: approved scenario `設備状態監視機能` and the four-level reference precedence.

- [ ] **Step 1: Write failing content tests**

~~~python
class SampleContentTests(unittest.TestCase):
    def test_template_contains_required_sections(self):
        text = self.read(
            "references/basic-design-template.md")
        for heading in (
            "# 基本設計書テンプレート",
            "## 1. 目的",
            "## 2. 適用範囲",
            "## 3. 構成",
            "## 4. 機能設計",
            "## 5. 異常処理",
            "## 6. スケジュール",
            "## 7. 承認"):
            self.assertIn(heading, text)

    def test_generation_request_is_docx_and_source_bounded(self):
        request = self.read_json("generation/document-request.json")
        self.assertEqual("docx", request["requestedFormat"])
        self.assertTrue(request["useReferencesAsFacts"])
        self.assertTrue(request["prohibitUnsupportedClaims"])

    def test_expected_outcomes_are_explicitly_non_authoritative(self):
        outcomes = self.read_json(
            "existing-document/expected-outcomes.json")
        self.assertEqual("explanatory_only", outcomes["authority"])
        self.assertEqual(9, len(outcomes["conditions"]))
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
python3 -m unittest tests.sample_catalog.test_sample_content -v
~~~

Expected: failures because the narrative files do not exist.

- [ ] **Step 3: Author the Markdown and text references**

`basic-design-template.md` must define the seven headings in Step 1, require both `対象` and `除外` statements in the scope section, require management number `DMS-####`, and require an explicit revision date and approver.

`control-terminology.txt` must contain exactly these normative lines after its title:

~~~text
設備状態監視: センサー値を周期的に取得し、しきい値との比較結果を通知する機能。
監視周期: 250 ms以下を標準とする。
警報: 継続運転を許可しつつ、運転員の確認を要求する通知。
異常: 安全確保のため、対象機能を停止または縮退させる状態。
機密区分: 「公開」「社内」「機密」のいずれかを使用する。
~~~

`samples/README.md` explains catalog validation and states that no `.clmproj`, `.clmcheck`, or result file is registered. The scenario README explains that all data is synthetic, the DOCX is the existing-mode target, four references are read-only, PDF cannot be edited, and `expected-outcomes.json` is not an AI input or authoritative result.

- [ ] **Step 4: Author generation and expectation JSON**

`document-request.json` uses title `設備状態監視機能 基本設計書`, purpose `承認レビュー用の基本設計書初稿を作成する`, audience `制御ソフトウェア設計者および品質保証担当者`, language `ja`, requested format `docx`, reference-bounded facts, and an instruction to emit the seven required sections without inventing unsupported values.

`expected-outcomes.json` uses `authority: "explanatory_only"` and nine entries `COND-0001` through `COND-0009`. It records examples of valid, invalid, and needs-information judgments; inherited, auto-fix, suggest-only, and do-not-modify behavior; the binding-policy precedence over the lower reference design; and the absence of an authoritative `result.json` until Plan 3.

- [ ] **Step 5: Run GREEN tests and commit**

~~~bash
python3 -m unittest tests.sample_catalog.test_sample_content -v
git diff --check
git add samples tests/sample_catalog/test_sample_content.py
git commit -m "docs: add demo sample narrative"
~~~

Expected: content tests pass and all text files are UTF-8/LF.

### Task 5: Generate and visually verify the DOCX and PDF documents

**Files:**
- Create: `samples/tools/build_demo_documents.py`
- Create: `samples/tools/requirements.txt`
- Create: `tests/sample_catalog/test_demo_documents.py`
- Create: `samples/ja-machine-control-design-review/existing-document/target/basic-design-before-review.docx`
- Create: `samples/ja-machine-control-design-review/references/reference-design.docx`
- Create: `samples/ja-machine-control-design-review/references/quality-assurance-policy.pdf`
- Modify: `.gitattributes`

**Interfaces:**
- Produces: `build_demo_documents.py --write` and `--check`.
- Produces: deterministic, searchable, non-sensitive DOCX/PDF assets.
- Consumes: python-docx 1.2.0 and ReportLab 4.4.9 in the developer tool; pypdf 6.10.0 in structural tests.

- [ ] **Step 1: Write failing structure and determinism tests**

The test runs the builder twice into separate temporary directories and byte-compares corresponding files. It then asserts:

~~~python
def test_docx_has_required_open_package_parts(self):
    path = self.generated / "existing-document/target/basic-design-before-review.docx"
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        self.assertIn("[Content_Types].xml", names)
        self.assertIn("word/document.xml", names)
        xml = archive.read("word/document.xml").decode("utf-8")
    self.assertIn("設備状態監視機能 基本設計書", xml)
    self.assertIn("500 ms", xml)
    self.assertIn("適切に", xml)

def test_pdf_is_searchable_and_unencrypted(self):
    reader = PdfReader(
        self.generated / "references/quality-assurance-policy.pdf")
    self.assertFalse(reader.is_encrypted)
    self.assertEqual(1, len(reader.pages))
    self.assertEqual("品質保証規程（デモ）", reader.metadata.title)
    text = reader.pages[0].extract_text()
    self.assertIn("250 ms", text)
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
"$CODEX_PRIMARY_RUNTIME_PYTHON" -m unittest \
  tests.sample_catalog.test_demo_documents -v
~~~

Expected: import/file failure because the builder and binary assets do not exist.

- [ ] **Step 3: Implement deterministic DOCX generation**

Use `standard_business_brief` tokens: US Letter portrait, 1-inch margins, Calibri 11 pt body at 1.10 spacing, H1 16 pt `#2E74B5`, H2 13 pt `#2E74B5`, H3 12 pt `#1F4D78`, 9360-DXA tables, 120-DXA table indent, and 80/80/120/120-DXA cell margins. Use a `memo_masthead` first page without a decorative bottom border.

The review-before target contains:

- Management number `DMS-2026`, version `0.7`, classification `社内`, revision date `2026-06-30`.
- Seven template sections.
- Concrete purpose and target scope, but no explicit excluded scope.
- Monitoring cycle `500 ms`, contradicting the binding `250 ms` rule.
- Ambiguous phrase `適切に通知する`.
- A real two-column parameter table and a real bulleted list.
- No final approver name, producing a needs-information example.

The lower-authority reference design also says `500 ms` so precedence resolution is visible.

Set fixed core properties and timestamps. Rewrite DOCX ZIP entries in ordinal path order with timestamp `1980-01-01 00:00:00`, mode `0644`, UTF-8 flag, and fixed deflate compression before comparing bytes.

Expose `build_target_docx(destination: Path)`, `build_reference_docx(destination: Path)`, `build_policy_pdf(destination: Path)`, `build_all(output_root: Path)`, `check_committed(sample_root: Path)`, and `main(argv)` so tests do not invoke shell subprocesses. `--write` targets the committed scenario directory. `--check` builds into `TemporaryDirectory`, byte-compares all three outputs, prints only relative mismatches, and exits `1` without rewriting. An optional `--output-root` is test-only and directs all outputs below the supplied temporary directory.

- [ ] **Step 4: Implement deterministic Japanese PDF generation**

Use ReportLab `canvas.Canvas(str(destination), pagesize=letter, invariant=1, pageCompression=1)` and register `UnicodeCIDFont("HeiseiKakuGo-W5")`. Create one searchable page titled `品質保証規程（デモ）` with these binding rules:

- Management number matches `DMS-[0-9]{4}`.
- Monitoring cycle is `250 ms` or less.
- `適切に` and `必要に応じて` are prohibited as unverifiable expressions.
- Classification is one of `公開`, `社内`, `機密`.
- The design identifies target, exclusions, revision date, and approver.

Set fixed title, author `CheckListMaker Demo`, subject, creator, and deterministic metadata. Do not add JavaScript, attachments, forms, encryption, signatures, or embedded files.

Pin the development-only requirements exactly:

~~~text
python-docx==1.2.0
reportlab==4.4.9
pypdf==6.10.0
~~~

- [ ] **Step 5: Add binary attributes and generate committed assets**

Append:

~~~gitattributes
*.docx binary
*.pdf binary
*.clmproj binary
*.clmcheck binary
~~~

Then run:

~~~bash
"$CODEX_PRIMARY_RUNTIME_PYTHON" samples/tools/build_demo_documents.py --write
"$CODEX_PRIMARY_RUNTIME_PYTHON" samples/tools/build_demo_documents.py --check
"$CODEX_PRIMARY_RUNTIME_PYTHON" -m unittest \
  tests.sample_catalog.test_demo_documents -v
~~~

- [ ] **Step 6: Render and inspect every page**

~~~bash
QA_DIR="$(mktemp -d)"
"$CODEX_PRIMARY_RUNTIME_PYTHON" \
  /root/.codex/skills/builtins/documents/render_docx.py \
  samples/ja-machine-control-design-review/existing-document/target/basic-design-before-review.docx \
  --output_dir "$QA_DIR/target" --emit_pdf
"$CODEX_PRIMARY_RUNTIME_PYTHON" \
  /root/.codex/skills/builtins/documents/render_docx.py \
  samples/ja-machine-control-design-review/references/reference-design.docx \
  --output_dir "$QA_DIR/reference" --emit_pdf
pdftoppm -png -r 150 \
  samples/ja-machine-control-design-review/references/quality-assurance-policy.pdf \
  "$QA_DIR/policy"
~~~

Open every generated PNG at 100%. Reject clipping, overlap, missing Japanese glyphs, broken table geometry, pinned cell text, misaligned bullets, or unexpected blank pages. After any correction, regenerate and repeat the complete render gate.

- [ ] **Step 7: Run GREEN checks and commit**

~~~bash
"$CODEX_PRIMARY_RUNTIME_PYTHON" samples/tools/build_demo_documents.py --check
"$CODEX_PRIMARY_RUNTIME_PYTHON" -m unittest \
  tests.sample_catalog.test_demo_documents -v
git diff --check
git add .gitattributes samples/tools samples/ja-machine-control-design-review tests/sample_catalog/test_demo_documents.py
git commit -m "test: add deterministic demo documents"
~~~

Expected: deterministic generation tests pass and visual QA has zero defects.

### Task 6: Register the sample and lock all file hashes

**Files:**
- Create: `samples/tools/update_sample_manifest.py`
- Create: `tests/sample_catalog/test_update_sample_manifest.py`
- Create: `samples/catalog.json`
- Create: `samples/ja-machine-control-design-review/sample-manifest.json`
- Modify: `tests/sample_catalog/test_validate_samples.py`

**Interfaces:**
- Produces: `update_sample_manifest.py --write` and `--check` using only Python standard library.
- Produces: one active catalog entry and a complete manifest with byte sizes and SHA-256 values.

- [ ] **Step 1: Write failing manifest-builder tests**

The test copies the sample tree to a temporary directory, runs the builder, and asserts the sorted paths are:

~~~text
existing-document/expected-outcomes.json
existing-document/target/basic-design-before-review.docx
generation/document-request.json
README.md
references/basic-design-template.md
references/control-terminology.txt
references/quality-assurance-policy.pdf
references/reference-design.docx
~~~

Also assert every SHA-256 matches `^[0-9a-f]{64}$`, mutate one byte, and verify `--check` exits `1` without rewriting the worktree.

- [ ] **Step 2: Run and verify RED**

~~~bash
python3 -m unittest tests.sample_catalog.test_update_sample_manifest -v
~~~

Expected: failure because the manifest builder does not exist.

- [ ] **Step 3: Implement deterministic manifest generation**

Use a fixed metadata dictionary for entry points, expected judgments, operations, and the four references. Discover only regular non-symlink files below the scenario root, excluding `sample-manifest.json`. Sort paths by ordinal POSIX path, assign purpose/media type from an exact path map, and compute size/hash from bytes.

`--write` writes two-space UTF-8/LF JSON with one trailing newline using an atomic temporary file and `os.replace`. `--check` builds in memory, byte-compares with the committed manifest, reports a concise relative-path error, and does not write.

Expose `hash_and_size(path: Path)`, `build_manifest(sample_root: Path)`, `render_manifest(manifest)`, `write_manifest(sample_root: Path)`, `check_manifest(sample_root: Path)`, and `main(argv)`. Tests call these functions directly; only the two CLI modes perform repository I/O.

- [ ] **Step 4: Create the catalog entry**

`samples/catalog.json` is exactly one array entry:

~~~json
[
  {
    "id": "ja-machine-control-design-review",
    "manifestPath": "samples/ja-machine-control-design-review/sample-manifest.json",
    "title": "設備状態監視機能 基本設計レビュー",
    "description": "既存文書レビューと文書生成を確認する日本語デモ",
    "modes": [
      "existing_document",
      "document_generation"
    ],
    "status": "active"
  }
]
~~~

- [ ] **Step 5: Generate, validate, and commit**

~~~bash
python3 samples/tools/update_sample_manifest.py --write
python3 samples/tools/update_sample_manifest.py --check
python3 samples/validate_samples.py --root .
python3 -m unittest discover -s tests/sample_catalog -p "test_*.py" -v
git diff --check
git add samples tests/sample_catalog
git commit -m "feat: register demo sample catalog"
~~~

Expected CLI output: `OK samples=1 files=8`.

### Task 7: Add the complete Domain JSON fixture and canonical round-trip test

**Files:**
- Create: `tests/CheckListMaker.Domain.Tests/Fixtures/complete-project.json`
- Create: `tests/CheckListMaker.Domain.Tests/Serialization/ProjectContractRoundTripTests.cs`

**Interfaces:**
- Produces: one existing-document `ProjectDefinition` fixture covering nine condition subtypes, four scope subtypes, both logic modes, all repair-policy paths, four authority levels, required reference roles, and imported-template origin.
- Consumes: real file sizes/hashes from `sample-manifest.json` and the contract corrections from Task 1.

- [ ] **Step 1: Write the failing canonical round-trip test**

Deserialize using `DomainJson.CreateOptions()`, assert existing mode, DOCX target, four references, imported-template origin, and exactly these ordered condition types:

~~~csharp
new[]
{
    typeof(SemanticCondition),
    typeof(RequiredTextCondition),
    typeof(ForbiddenTextCondition),
    typeof(NumberCondition),
    typeof(LengthOrCountCondition),
    typeof(DateOrDeadlineCondition),
    typeof(PatternCondition),
    typeof(OneOfCondition),
    typeof(CrossSourceConsistencyCondition)
}
~~~

Assert the ordered scope types as well:

~~~csharp
new[]
{
    typeof(EntireDocumentScope),
    typeof(SectionScope),
    typeof(EntireDocumentScope),
    typeof(TableScope),
    typeof(SemanticLocatorScope),
    typeof(SectionScope),
    typeof(TableScope),
    typeof(EntireDocumentScope),
    typeof(SemanticLocatorScope)
}
~~~

Canonicalize recursively by sorting object properties with `StringComparer.Ordinal` while preserving array order, then compare canonical bytes before and after serialization.

- [ ] **Step 2: Run and verify RED**

~~~powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj `
  --filter FullyQualifiedName~ProjectContractRoundTripTests
~~~

Expected: failure because `complete-project.json` is absent.

- [ ] **Step 3: Create the complete fixture**

Use fixed project UUID `11111111-1111-1111-1111-111111111111` and template UUID `22222222-2222-2222-2222-222222222222`. Use the real sample target/reference filenames, media types, sizes, and hashes from the registered manifest.

Create five checklist items containing nine conditions:

| IDs | Logic | Types | Policy |
|---|---|---|---|
| `CHK-0001` / `COND-0001..0002` | `all` | semantic, required_text | inherited `suggest_only` |
| `CHK-0002` / `COND-0003..0004` | `any` | forbidden_text, number | `auto_fix` |
| `CHK-0003` / `COND-0005..0006` | `all` | length_or_count, date_or_deadline | `do_not_modify` |
| `CHK-0004` / `COND-0007..0008` | `any` | pattern, one_of | explicit `suggest_only` |
| `CHK-0005` / `COND-0009` | `all` | cross_source_consistency | `auto_fix` |

Use normalized decimal string `"250"` for the monitoring-cycle number condition. Include `REF-001` through `REF-004` at binding/approved/working/reference levels with priorities 100/80/60/40. Include required role `ROLE-001` and assign it to the binding and approved references. Omit all null alternatives so `WhenWritingNull` reserialization is stable.

Use these exact condition payloads:

| ID | Type | Scope | Required values |
|---|---|---|---|
| `COND-0001` | `semantic` | `entire_document` | purpose is concrete and verifiable |
| `COND-0002` | `required_text` | exact section `2. 適用範囲` | `対象`, `除外`; match `all` |
| `COND-0003` | `forbidden_text` | `entire_document` | `適切に`, `必要に応じて` |
| `COND-0004` | `number` | table `主要パラメータ` | subject `監視周期`, `less_than_or_equal`, value `"250"`, unit `ms` |
| `COND-0005` | `length_or_count` | semantic locator `承認者と承認手順` | occurrence text `承認`, `greater_than_or_equal`, value `1` |
| `COND-0006` | `date_or_deadline` | semantic section `6. スケジュール` | subject `改訂日`, `on_or_after`, value `2026-07-01` |
| `COND-0007` | `pattern` | table `文書情報` | custom `^DMS-[0-9]{4}$` |
| `COND-0008` | `one_of` | `entire_document` | subject `機密区分`; `公開`, `社内`, `機密` |
| `COND-0009` | `cross_source_consistency` | semantic locator `監視周期と用語定義` | reference IDs `REF-001`, `REF-002`, `REF-003`, `REF-004` |

- [ ] **Step 4: Run GREEN checks and commit**

~~~powershell
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj `
  --filter FullyQualifiedName~ProjectContractRoundTripTests
dotnet test tests/CheckListMaker.Domain.Tests/CheckListMaker.Domain.Tests.csproj
dotnet build CheckListMaker.sln --configuration Release
git diff --check
git add tests/CheckListMaker.Domain.Tests
git commit -m "test: lock complete demo project contract"
~~~

Expected: tests and build pass with zero warnings.

## Completion Gate

Run from the repository root:

~~~bash
python3 -m unittest discover -s tests/sample_catalog -p "test_*.py" -v
python3 -m py_compile samples/validate_samples.py samples/tools/*.py
python3 samples/tools/update_sample_manifest.py --check
python3 samples/validate_samples.py --root .
"$CODEX_PRIMARY_RUNTIME_PYTHON" samples/tools/build_demo_documents.py --check
git diff --check
git status --short --branch
~~~

Run with .NET 10:

~~~powershell
dotnet restore CheckListMaker.sln
dotnet test CheckListMaker.sln --configuration Release --no-restore
dotnet build CheckListMaker.sln --configuration Release --no-restore
~~~

Repeat the Task 5 DOCX/PDF render commands and inspect every page. Completion requires:

- Python unit tests and real catalog validation pass.
- The validator reports exactly one sample and eight files.
- Document regeneration is byte-stable.
- All DOCX/PDF pages pass visual QA.
- Domain fixture round-trip, full tests, and Release build pass under .NET 10.
- `git status` contains no untracked QA artifacts.
- Accepted task commits are published to `origin/agent/implement-checklistmaker-mvp` and visible in draft PR #1.
