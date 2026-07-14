using System.Text.Json.Serialization;
using CheckListMaker.Domain.Conditions;
using CheckListMaker.Domain.Repairs;
using CheckListMaker.Domain.References;
namespace CheckListMaker.Domain.Checklists;
public enum ConditionLogic { All, Any }
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(CreatedInProjectOrigin), "created_in_project")]
[JsonDerivedType(typeof(ImportedTemplateOrigin), "template")]
public abstract record ChecklistOrigin;
public sealed record CreatedInProjectOrigin : ChecklistOrigin;
public sealed record ImportedTemplateOrigin : ChecklistOrigin
{
    public required Guid TemplateId { get; init; }
    public required string TemplateName { get; init; }
    public required int Revision { get; init; }
    public string? VersionLabel { get; init; }
    public required DateTimeOffset ImportedAt { get; init; }
    public required string SourceSha256 { get; init; }
    public bool ModifiedAfterImport { get; init; }
}
public sealed record CheckItemDefinition
{
    public required string Id { get; init; }
    public required string Title { get; init; }
    public string? Description { get; init; }
    public bool Required { get; init; } = true;
    public bool AllowNotApplicable { get; init; }
    public ConditionLogic ConditionLogic { get; init; } = ConditionLogic.All;
    public RepairPolicy? RepairPolicy { get; init; }
    public IReadOnlyList<ConditionDefinition> Conditions { get; init; } = Array.Empty<ConditionDefinition>();
    public string? Notes { get; init; }
}
public sealed record ChecklistDefinition
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public IReadOnlyList<CheckItemDefinition> Items { get; init; } = Array.Empty<CheckItemDefinition>();
    public IReadOnlyList<string> RetiredCheckItemIds { get; init; } = Array.Empty<string>();
    public IReadOnlyList<string> RetiredConditionIds { get; init; } = Array.Empty<string>();
    public IReadOnlyList<ReferenceRoleDefinition> RequiredReferenceRoles { get; init; } = Array.Empty<ReferenceRoleDefinition>();
}
