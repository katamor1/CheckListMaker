using System.Collections.ObjectModel;
using System.Text.RegularExpressions;
namespace CheckListMaker.Domain.Validation;
public enum IssueSeverity { Warning, Error }
public sealed record DomainIssue(string Code, IssueSeverity Severity, string Path, string Message);
public sealed record ValidationResult
{
    public static ValidationResult Success { get; } = new(Array.Empty<DomainIssue>());
    public ValidationResult(IEnumerable<DomainIssue> issues)
    {
        Issues = new ReadOnlyCollection<DomainIssue>(issues.OrderBy(x => x.Path, StringComparer.Ordinal).ThenBy(x => x.Code, StringComparer.Ordinal).ToArray());
    }
    public IReadOnlyList<DomainIssue> Issues { get; }
    public bool IsValid => Issues.All(x => x.Severity != IssueSeverity.Error);
    public static ValidationResult FromIssues(IEnumerable<DomainIssue> issues) => new(issues);
}
public static partial class IdentifierRules
{
    [GeneratedRegex("^CHK-[0-9]{4}$", RegexOptions.CultureInvariant)] private static partial Regex CheckItemRegex();
    [GeneratedRegex("^COND-[0-9]{4}$", RegexOptions.CultureInvariant)] private static partial Regex ConditionRegex();
    [GeneratedRegex("^REF-[0-9]{3}$", RegexOptions.CultureInvariant)] private static partial Regex ReferenceRegex();
    public static bool IsCheckItemId(string? value) => value is not null && CheckItemRegex().IsMatch(value);
    public static bool IsConditionId(string? value) => value is not null && ConditionRegex().IsMatch(value);
    public static bool IsReferenceId(string? value) => value is not null && ReferenceRegex().IsMatch(value);
}
