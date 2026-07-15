using System.Buffers;
using System.Text.Json;
using CheckListMaker.Domain.Checklists;
using CheckListMaker.Domain.Conditions;
using CheckListMaker.Domain.Projects;
using CheckListMaker.Domain.References;
using CheckListMaker.Domain.Repairs;
using CheckListMaker.Domain.Scopes;
using CheckListMaker.Domain.Serialization;
using Microsoft.VisualStudio.TestTools.UnitTesting;

namespace CheckListMaker.Domain.Tests.Serialization;

[TestClass]
public sealed class ProjectContractRoundTripTests
{
    private static readonly JsonSerializerOptions Options =
        DomainJson.CreateOptions();

    private static readonly Type[] ExpectedConditionTypes =
    [
        typeof(SemanticCondition),
        typeof(RequiredTextCondition),
        typeof(ForbiddenTextCondition),
        typeof(NumberCondition),
        typeof(LengthOrCountCondition),
        typeof(DateOrDeadlineCondition),
        typeof(PatternCondition),
        typeof(OneOfCondition),
        typeof(CrossSourceConsistencyCondition)
    ];

    private static readonly Type[] ExpectedScopeTypes =
    [
        typeof(EntireDocumentScope),
        typeof(SectionScope),
        typeof(EntireDocumentScope),
        typeof(TableScope),
        typeof(SemanticLocatorScope),
        typeof(SectionScope),
        typeof(TableScope),
        typeof(EntireDocumentScope),
        typeof(SemanticLocatorScope)
    ];

    private static readonly string[] ExpectedReferenceIds =
        ["REF-001", "REF-002", "REF-003", "REF-004"];

    private static readonly AuthorityLevel[] ExpectedAuthorityLevels =
    [
        AuthorityLevel.Binding,
        AuthorityLevel.Approved,
        AuthorityLevel.Working,
        AuthorityLevel.Reference
    ];

    private static readonly int[] ExpectedReferencePriorities =
        [100, 80, 60, 40];

    private static readonly string[] RequiredRoleIds = ["ROLE-001"];

    private static readonly string[] ExpectedItemIds =
        ["CHK-0001", "CHK-0002", "CHK-0003", "CHK-0004", "CHK-0005"];

    private static readonly int[] ExpectedConditionCounts = [2, 2, 2, 2, 1];

    private static readonly ConditionLogic[] ExpectedConditionLogics =
    [
        ConditionLogic.All,
        ConditionLogic.Any,
        ConditionLogic.All,
        ConditionLogic.Any,
        ConditionLogic.All
    ];

    private static readonly RepairPolicy?[] ExpectedItemPolicies =
    [
        null,
        RepairPolicy.AutoFix,
        RepairPolicy.DoNotModify,
        RepairPolicy.SuggestOnly,
        RepairPolicy.AutoFix
    ];

    private static readonly RepairPolicy[] ExpectedEffectivePolicies =
    [
        RepairPolicy.SuggestOnly,
        RepairPolicy.AutoFix,
        RepairPolicy.DoNotModify,
        RepairPolicy.SuggestOnly,
        RepairPolicy.AutoFix
    ];

    private static readonly string[] ExpectedConditionIds =
    [
        "COND-0001",
        "COND-0002",
        "COND-0003",
        "COND-0004",
        "COND-0005",
        "COND-0006",
        "COND-0007",
        "COND-0008",
        "COND-0009"
    ];

    private static readonly string[] ExpectedRequiredTextValues =
        ["対象", "除外"];

    private static readonly string[] ExpectedForbiddenTextValues =
        ["適切に", "必要に応じて"];

    private static readonly string[] ExpectedAllowedValues =
        ["公開", "社内", "機密"];

    [TestMethod]
    public void CompleteProjectFixtureRoundTripsCanonically()
    {
        string fixturePath = Path.Combine(
            AppContext.BaseDirectory,
            "Fixtures",
            "complete-project.json");
        byte[] fixtureBytes = File.ReadAllBytes(fixturePath);

        ProjectDefinition? deserialized =
            JsonSerializer.Deserialize<ProjectDefinition>(fixtureBytes, Options);

        Assert.IsNotNull(deserialized);
        ProjectDefinition project = deserialized;
        AssertProjectEnvelope(project);

        CheckItemDefinition[] items = project.Checklist.Items.ToArray();
        ConditionDefinition[] conditions = items
            .SelectMany(static item => item.Conditions)
            .ToArray();

        AssertChecklistContract(project, items, conditions);
        AssertConditionPayloads(conditions);

        byte[] serializedBytes =
            JsonSerializer.SerializeToUtf8Bytes(project, Options);
        byte[] expectedCanonicalBytes = Canonicalize(fixtureBytes);
        byte[] actualCanonicalBytes = Canonicalize(serializedBytes);

        CollectionAssert.AreEqual(
            expectedCanonicalBytes,
            actualCanonicalBytes);
    }

    private static void AssertProjectEnvelope(ProjectDefinition project)
    {
        Assert.AreEqual("1.0", project.FormatVersion);
        Assert.AreEqual(
            Guid.Parse("11111111-1111-1111-1111-111111111111"),
            project.ProjectId);
        Assert.AreEqual("設備状態監視機能 基本設計レビュー", project.Name);
        Assert.AreEqual(ProjectMode.ExistingDocument, project.Mode);
        Assert.AreEqual(RepairPolicy.SuggestOnly, project.DefaultRepairPolicy);
        Assert.IsNull(project.Generation);

        Assert.IsNotNull(project.Target);
        Assert.AreEqual(DocumentFormat.Docx, project.Target.Format);
        Assert.IsTrue(project.Target.Editable);
        AssertImportedFile(
            project.Target.File,
            "basic-design-before-review.docx",
            "existing-document/target/basic-design-before-review.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            37_366,
            "9e98b7d5485f321c94e18ed0c4da9367eb650da9a768de0cf68622fbf86107bc");

        AssertReferenceContract(project.References);

        Assert.IsInstanceOfType<ImportedTemplateOrigin>(project.Origin);
        var origin = (ImportedTemplateOrigin)project.Origin;
        Assert.AreEqual(
            Guid.Parse("22222222-2222-2222-2222-222222222222"),
            origin.TemplateId);
        Assert.AreEqual("基本設計テンプレート", origin.TemplateName);
        Assert.AreEqual(1, origin.Revision);
        Assert.AreEqual("1.0", origin.VersionLabel);
        Assert.AreEqual(
            "ec977d63a4ac916171563e60ac7e316b49994bfd7599214f6c820bb0f711895a",
            origin.SourceSha256);
        Assert.IsTrue(origin.ModifiedAfterImport);
    }

    private static void AssertReferenceContract(
        IReadOnlyList<ReferenceDocumentDefinition> references)
    {
        Assert.HasCount(4, references);
        CollectionAssert.AreEqual(
            ExpectedReferenceIds,
            references.Select(static reference => reference.Id).ToArray());
        CollectionAssert.AreEqual(
            ExpectedAuthorityLevels,
            references
                .Select(static reference => reference.AuthorityLevel)
                .ToArray());
        CollectionAssert.AreEqual(
            ExpectedReferencePriorities,
            references.Select(static reference => reference.Priority).ToArray());

        CollectionAssert.AreEqual(
            RequiredRoleIds,
            references[0].RoleIds.ToArray());
        CollectionAssert.AreEqual(
            RequiredRoleIds,
            references[1].RoleIds.ToArray());
        Assert.IsEmpty(references[2].RoleIds);
        Assert.IsEmpty(references[3].RoleIds);

        AssertImportedFile(
            references[0].File,
            "quality-assurance-policy.pdf",
            "references/quality-assurance-policy.pdf",
            "application/pdf",
            4_423,
            "7a307f0e7461891d92f21522c22bcef6f42b8e4a2bf4737d036eb0c8bb0d9f4a");
        AssertImportedFile(
            references[1].File,
            "basic-design-template.md",
            "references/basic-design-template.md",
            "text/markdown",
            1_377,
            "ec977d63a4ac916171563e60ac7e316b49994bfd7599214f6c820bb0f711895a");
        AssertImportedFile(
            references[2].File,
            "control-terminology.txt",
            "references/control-terminology.txt",
            "text/plain",
            436,
            "d90983e882e103b093aae4b2609b91e8026f2ce917af9aaf711010e5c5a4d913");
        AssertImportedFile(
            references[3].File,
            "reference-design.docx",
            "references/reference-design.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            36_699,
            "50d6ab7caef850a62227943c3a1ea9567f459ebd6b0f556efd6e128a19b71544");
    }

    private static void AssertImportedFile(
        ImportedFileDefinition file,
        string originalFileName,
        string storedPath,
        string mediaType,
        long sizeBytes,
        string sha256)
    {
        Assert.AreEqual(originalFileName, file.OriginalFileName);
        Assert.AreEqual(storedPath, file.StoredPath);
        Assert.AreEqual(mediaType, file.MediaType);
        Assert.AreEqual(sizeBytes, file.SizeBytes);
        Assert.AreEqual(sha256, file.Sha256);
    }

    private static void AssertChecklistContract(
        ProjectDefinition project,
        CheckItemDefinition[] items,
        ConditionDefinition[] conditions)
    {
        Assert.AreEqual("基本設計レビュー完全チェックリスト", project.Checklist.Name);
        Assert.HasCount(5, items);
        Assert.HasCount(9, conditions);
        CollectionAssert.AreEqual(
            ExpectedItemIds,
            items.Select(static item => item.Id).ToArray());
        CollectionAssert.AreEqual(
            ExpectedConditionCounts,
            items.Select(static item => item.Conditions.Count).ToArray());
        CollectionAssert.AreEqual(
            ExpectedConditionLogics,
            items.Select(static item => item.ConditionLogic).ToArray());
        CollectionAssert.AreEqual(
            ExpectedItemPolicies,
            items.Select(static item => item.RepairPolicy).ToArray());
        CollectionAssert.AreEqual(
            ExpectedEffectivePolicies,
            items
                .Select(item => RepairPolicyResolver.Resolve(project, item))
                .ToArray());

        CollectionAssert.AreEqual(
            ExpectedConditionIds,
            conditions.Select(static condition => condition.Id).ToArray());
        CollectionAssert.AreEqual(
            ExpectedConditionTypes,
            conditions.Select(static condition => condition.GetType()).ToArray());
        CollectionAssert.AreEqual(
            ExpectedScopeTypes,
            conditions
                .Select(static condition => condition.Scope.GetType())
                .ToArray());

        Assert.HasCount(1, project.Checklist.RequiredReferenceRoles);
        ReferenceRoleDefinition role =
            project.Checklist.RequiredReferenceRoles[0];
        Assert.AreEqual("ROLE-001", role.RoleId);
        Assert.AreEqual("品質基準", role.Name);
        Assert.IsTrue(role.Required);
        Assert.AreEqual(
            AuthorityLevel.Approved,
            role.RecommendedAuthorityLevel);
    }

    private static void AssertConditionPayloads(ConditionDefinition[] conditions)
    {
        var semantic = AssertConditionType<SemanticCondition>(conditions[0]);
        Assert.AreEqual("目的が具体的で検証可能であること", semantic.Instruction);

        var requiredText =
            AssertConditionType<RequiredTextCondition>(conditions[1]);
        CollectionAssert.AreEqual(
            ExpectedRequiredTextValues,
            requiredText.Values.ToArray());
        Assert.AreEqual(TextMatchMode.All, requiredText.MatchMode);
        Assert.IsFalse(requiredText.CaseSensitive);
        var exactSection = AssertScopeType<SectionScope>(requiredText.Scope);
        Assert.AreEqual("2. 適用範囲", exactSection.Heading);
        Assert.AreEqual(HeadingMatchMode.Exact, exactSection.MatchMode);

        var forbiddenText =
            AssertConditionType<ForbiddenTextCondition>(conditions[2]);
        CollectionAssert.AreEqual(
            ExpectedForbiddenTextValues,
            forbiddenText.Values.ToArray());
        Assert.IsFalse(forbiddenText.CaseSensitive);

        var number = AssertConditionType<NumberCondition>(conditions[3]);
        Assert.AreEqual("監視周期", number.Subject);
        Assert.AreEqual(NumericOperator.LessThanOrEqual, number.Operator);
        Assert.AreEqual(250m, number.Value);
        Assert.AreEqual("ms", number.Unit);
        var parameterTable = AssertScopeType<TableScope>(number.Scope);
        Assert.AreEqual("主要パラメータ", parameterTable.Description);

        var count =
            AssertConditionType<LengthOrCountCondition>(conditions[4]);
        Assert.AreEqual(CountMeasure.Occurrences, count.Measure);
        Assert.AreEqual(NumericOperator.GreaterThanOrEqual, count.Operator);
        Assert.AreEqual(1, count.Value);
        Assert.AreEqual("承認", count.OccurrenceText);
        var approvalLocator =
            AssertScopeType<SemanticLocatorScope>(count.Scope);
        Assert.AreEqual("承認者と承認手順", approvalLocator.Description);

        var deadline =
            AssertConditionType<DateOrDeadlineCondition>(conditions[5]);
        Assert.AreEqual("改訂日", deadline.Subject);
        Assert.AreEqual(DateOperator.OnOrAfter, deadline.Operator);
        Assert.AreEqual(new DateOnly(2026, 7, 1), deadline.Value);
        var scheduleSection = AssertScopeType<SectionScope>(deadline.Scope);
        Assert.AreEqual("6. スケジュール", scheduleSection.Heading);
        Assert.AreEqual(HeadingMatchMode.Semantic, scheduleSection.MatchMode);

        var pattern = AssertConditionType<PatternCondition>(conditions[6]);
        Assert.AreEqual(PatternPreset.Custom, pattern.Preset);
        Assert.AreEqual("^DMS-[0-9]{4}$", pattern.Pattern);
        var informationTable = AssertScopeType<TableScope>(pattern.Scope);
        Assert.AreEqual("文書情報", informationTable.Description);

        var oneOf = AssertConditionType<OneOfCondition>(conditions[7]);
        Assert.AreEqual("機密区分", oneOf.Subject);
        CollectionAssert.AreEqual(
            ExpectedAllowedValues,
            oneOf.AllowedValues.ToArray());

        var consistency =
            AssertConditionType<CrossSourceConsistencyCondition>(conditions[8]);
        CollectionAssert.AreEqual(
            ExpectedReferenceIds,
            consistency.ReferenceSourceIds.ToArray());
        var consistencyLocator =
            AssertScopeType<SemanticLocatorScope>(consistency.Scope);
        Assert.AreEqual("監視周期と用語定義", consistencyLocator.Description);
    }

    private static TCondition AssertConditionType<TCondition>(
        ConditionDefinition condition)
        where TCondition : ConditionDefinition
    {
        Assert.IsInstanceOfType<TCondition>(condition);
        return (TCondition)condition;
    }

    private static TScope AssertScopeType<TScope>(ScopeDefinition scope)
        where TScope : ScopeDefinition
    {
        Assert.IsInstanceOfType<TScope>(scope);
        return (TScope)scope;
    }

    private static byte[] Canonicalize(byte[] json)
    {
        using JsonDocument document = JsonDocument.Parse(json);
        var buffer = new ArrayBufferWriter<byte>();

        using (var writer = new Utf8JsonWriter(buffer))
        {
            WriteCanonicalJson(writer, document.RootElement);
        }

        return buffer.WrittenSpan.ToArray();
    }

    private static void WriteCanonicalJson(
        Utf8JsonWriter writer,
        JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (JsonProperty property in element
                    .EnumerateObject()
                    .OrderBy(static property => property.Name, StringComparer.Ordinal))
                {
                    writer.WritePropertyName(property.Name);
                    WriteCanonicalJson(writer, property.Value);
                }

                writer.WriteEndObject();
                break;

            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (JsonElement item in element.EnumerateArray())
                {
                    WriteCanonicalJson(writer, item);
                }

                writer.WriteEndArray();
                break;

            default:
                element.WriteTo(writer);
                break;
        }
    }
}
