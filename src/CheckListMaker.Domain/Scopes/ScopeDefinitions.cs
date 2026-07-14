using System.Text.Json.Serialization;
namespace CheckListMaker.Domain.Scopes;
public enum ScopeNotFoundBehavior { Invalid, NeedsInformation }
public enum HeadingMatchMode { Exact, Semantic }
public enum ScopeConfidence { Low, Medium, High }
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(EntireDocumentScope), "entire_document")]
[JsonDerivedType(typeof(SectionScope), "section")]
[JsonDerivedType(typeof(TableScope), "table")]
[JsonDerivedType(typeof(SemanticLocatorScope), "semantic_locator")]
public abstract record ScopeDefinition
{
    public ScopeNotFoundBehavior OnNotFound { get; init; } = ScopeNotFoundBehavior.NeedsInformation;
    public IReadOnlyList<string> SourceIds { get; init; } = Array.Empty<string>();
}
public sealed record EntireDocumentScope : ScopeDefinition;
public sealed record SectionScope : ScopeDefinition
{
    public required string Heading { get; init; }
    public HeadingMatchMode MatchMode { get; init; } = HeadingMatchMode.Semantic;
    public bool IncludeSubsections { get; init; } = true;
}
public sealed record TableScope : ScopeDefinition
{
    public required string Description { get; init; }
    public IReadOnlyList<string> ExpectedColumns { get; init; } = Array.Empty<string>();
}
public sealed record SemanticLocatorScope : ScopeDefinition
{
    public required string Description { get; init; }
}
