using System.Text.Json.Serialization;
using CheckListMaker.Domain.Scopes;
using CheckListMaker.Domain.Serialization;
namespace CheckListMaker.Domain.Conditions;
public enum TextMatchMode { All, Any }
public enum NumericOperator { Equal, NotEqual, LessThan, LessThanOrEqual, GreaterThan, GreaterThanOrEqual, Between }
public enum CountMeasure { Characters, Words, Paragraphs, Headings, ListItems, Occurrences }
public enum DateOperator { Exists, On, Before, OnOrBefore, After, OnOrAfter, Between, StartOnOrBeforeEnd }
public enum PatternPreset { Email, Url, Phone, PostalCode, IsoDate, ManagementNumber, Custom }
[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(SemanticCondition), "semantic")]
[JsonDerivedType(typeof(RequiredTextCondition), "required_text")]
[JsonDerivedType(typeof(ForbiddenTextCondition), "forbidden_text")]
[JsonDerivedType(typeof(NumberCondition), "number")]
[JsonDerivedType(typeof(LengthOrCountCondition), "length_or_count")]
[JsonDerivedType(typeof(DateOrDeadlineCondition), "date_or_deadline")]
[JsonDerivedType(typeof(PatternCondition), "pattern")]
[JsonDerivedType(typeof(OneOfCondition), "one_of")]
[JsonDerivedType(typeof(CrossSourceConsistencyCondition), "cross_source_consistency")]
public abstract record ConditionDefinition
{
    public required string Id { get; init; }
    public required ScopeDefinition Scope { get; init; }
}
public sealed record SemanticCondition : ConditionDefinition { public required string Instruction { get; init; } }
public sealed record RequiredTextCondition : ConditionDefinition
{
    public IReadOnlyList<string> Values { get; init; } = Array.Empty<string>();
    public TextMatchMode MatchMode { get; init; } = TextMatchMode.All;
    public bool CaseSensitive { get; init; }
}
public sealed record ForbiddenTextCondition : ConditionDefinition
{
    public IReadOnlyList<string> Values { get; init; } = Array.Empty<string>();
    public bool CaseSensitive { get; init; }
}
public sealed record NumberCondition : ConditionDefinition
{
    public required string Subject { get; init; }
    public NumericOperator Operator { get; init; }
    [JsonConverter(typeof(NormalizedNullableDecimalStringConverter))]
    public decimal? Value { get; init; }
    [JsonConverter(typeof(NormalizedNullableDecimalStringConverter))]
    public decimal? Minimum { get; init; }
    [JsonConverter(typeof(NormalizedNullableDecimalStringConverter))]
    public decimal? Maximum { get; init; }
    public string? Unit { get; init; }
}
public sealed record LengthOrCountCondition : ConditionDefinition
{
    public CountMeasure Measure { get; init; }
    public NumericOperator Operator { get; init; }
    public int? Value { get; init; }
    public int? Minimum { get; init; }
    public int? Maximum { get; init; }
    public string? OccurrenceText { get; init; }
}
public sealed record DateOrDeadlineCondition : ConditionDefinition
{
    public required string Subject { get; init; }
    public DateOperator Operator { get; init; }
    public DateOnly? Value { get; init; }
    public DateOnly? Minimum { get; init; }
    public DateOnly? Maximum { get; init; }
}
public sealed record PatternCondition : ConditionDefinition
{
    public PatternPreset Preset { get; init; }
    public required string Pattern { get; init; }
    public required string Description { get; init; }
}
public sealed record OneOfCondition : ConditionDefinition
{
    public required string Subject { get; init; }
    public IReadOnlyList<string> AllowedValues { get; init; } = Array.Empty<string>();
}
public sealed record CrossSourceConsistencyCondition : ConditionDefinition
{
    public required string Instruction { get; init; }
    public IReadOnlyList<string> ReferenceSourceIds { get; init; } = Array.Empty<string>();
}
