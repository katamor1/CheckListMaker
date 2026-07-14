using CheckListMaker.Domain.Checklists;
using CheckListMaker.Domain.Projects;
namespace CheckListMaker.Domain.Repairs;
public enum RepairPolicy { AutoFix, SuggestOnly, DoNotModify }
public static class RepairPolicyResolver
{
    public static RepairPolicy Resolve(ProjectDefinition project, CheckItemDefinition item) => item.RepairPolicy ?? project.DefaultRepairPolicy;
}
