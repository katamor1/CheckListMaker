using CheckListMaker.Domain.Checklists;
namespace CheckListMaker.Domain.Results;
public enum ConditionStatus { Valid, Invalid, NeedsInformation, NotEvaluated }
public enum ItemStatus { Valid, Invalid, Repaired, NeedsInformation, NotApplicable }
public enum OverallStatus { Passed, PassedWithWarnings, Failed, NeedsInformation }
public sealed record ConditionDecision(string ConditionId, ConditionStatus Status);
public sealed record ItemDecision(string CheckItemId, bool Required, ItemStatus Status);
public sealed record ResultSummary(int TotalItems, int RequiredItems, int OptionalItems, int ValidItems, int RepairedItems, int InvalidItems, int NeedsInformationItems, int NotApplicableItems, int WarningCount, OverallStatus OverallStatus);
public static class ResultAggregationService
{
    public static ItemStatus AggregateItem(ConditionLogic logic, IReadOnlyList<ConditionDecision> conditions)
    {
        ArgumentNullException.ThrowIfNull(conditions);
        if (conditions.Count == 0) throw new ArgumentException("Condition group cannot be empty.", nameof(conditions));
        if (logic == ConditionLogic.All)
        {
            if (conditions.Any(x => x.Status == ConditionStatus.Invalid)) return ItemStatus.Invalid;
            if (conditions.Any(x => x.Status == ConditionStatus.NeedsInformation)) return ItemStatus.NeedsInformation;
            if (conditions.Any(x => x.Status == ConditionStatus.NotEvaluated)) throw new InvalidOperationException("not_evaluated is only valid after an OR short-circuit.");
            return ItemStatus.Valid;
        }
        if (conditions.Any(x => x.Status == ConditionStatus.Valid)) return ItemStatus.Valid;
        if (conditions.Any(x => x.Status == ConditionStatus.NeedsInformation)) return ItemStatus.NeedsInformation;
        if (conditions.All(x => x.Status == ConditionStatus.Invalid)) return ItemStatus.Invalid;
        throw new InvalidOperationException("OR groups may use not_evaluated only when another condition is valid.");
    }
    public static ResultSummary AggregateOverall(IReadOnlyList<ItemDecision> items)
    {
        ArgumentNullException.ThrowIfNull(items);
        var required = items.Where(x => x.Required).ToArray();
        var optional = items.Where(x => !x.Required).ToArray();
        OverallStatus overall = required.Any(x => x.Status == ItemStatus.Invalid)
            ? OverallStatus.Failed
            : required.Any(x => x.Status == ItemStatus.NeedsInformation)
                ? OverallStatus.NeedsInformation
                : optional.Any(IsWarning)
                    ? OverallStatus.PassedWithWarnings
                    : OverallStatus.Passed;
        return new(items.Count, required.Length, optional.Length,
            items.Count(x => x.Status == ItemStatus.Valid), items.Count(x => x.Status == ItemStatus.Repaired),
            items.Count(x => x.Status == ItemStatus.Invalid), items.Count(x => x.Status == ItemStatus.NeedsInformation),
            items.Count(x => x.Status == ItemStatus.NotApplicable), optional.Count(IsWarning), overall);
    }
    private static bool IsWarning(ItemDecision item) => item.Status is ItemStatus.Invalid or ItemStatus.NeedsInformation;
}
