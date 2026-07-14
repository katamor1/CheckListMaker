using CheckListMaker.Domain.Projects;
namespace CheckListMaker.Domain.References;
public enum AuthorityLevel { Reference = 0, Working = 1, Approved = 2, Binding = 3 }
public sealed record ReferenceRoleDefinition
{
    public required string RoleId { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public bool Required { get; init; }
    public AuthorityLevel RecommendedAuthorityLevel { get; init; } = AuthorityLevel.Reference;
}
public sealed record ReferenceDocumentDefinition
{
    public required string Id { get; init; }
    public required ImportedFileDefinition File { get; init; }
    public required string Title { get; init; }
    public required string Purpose { get; init; }
    public AuthorityLevel AuthorityLevel { get; init; } = AuthorityLevel.Reference;
    public int Priority { get; init; } = 50;
    public DateOnly? EffectiveDate { get; init; }
    public IReadOnlyList<string> RoleIds { get; init; } = Array.Empty<string>();
    public bool ReadOnly { get; init; } = true;
}
public sealed class ReferencePrecedenceComparer : IComparer<ReferenceDocumentDefinition>
{
    public static ReferencePrecedenceComparer Instance { get; } = new();
    public int Compare(ReferenceDocumentDefinition? x, ReferenceDocumentDefinition? y)
    {
        if (ReferenceEquals(x, y)) return 0;
        if (x is null) return 1;
        if (y is null) return -1;
        var authority = y.AuthorityLevel.CompareTo(x.AuthorityLevel);
        if (authority != 0) return authority;
        var priority = y.Priority.CompareTo(x.Priority);
        if (priority != 0) return priority;
        return StringComparer.Ordinal.Compare(x.Id, y.Id);
    }
    public static bool IsConflictTie(ReferenceDocumentDefinition x, ReferenceDocumentDefinition y) => x.AuthorityLevel == y.AuthorityLevel && x.Priority == y.Priority;
}
