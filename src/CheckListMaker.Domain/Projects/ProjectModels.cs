using CheckListMaker.Domain.Checklists;
using CheckListMaker.Domain.Repairs;
using CheckListMaker.Domain.References;
using CheckListMaker.Domain.Validation;
namespace CheckListMaker.Domain.Projects;
public enum ProjectMode { ExistingDocument, DocumentGeneration }
public enum DocumentFormat { Markdown, Text, Docx, Pdf }
public sealed record ImportedFileDefinition
{
    public required string OriginalFileName { get; init; }
    public required string StoredPath { get; init; }
    public required string MediaType { get; init; }
    public required long SizeBytes { get; init; }
    public required string Sha256 { get; init; }
    public required DateTimeOffset ImportedAt { get; init; }
}
public sealed record TargetDocumentDefinition
{
    public required ImportedFileDefinition File { get; init; }
    public required DocumentFormat Format { get; init; }
    public bool Editable { get; init; }
}
public sealed record DocumentGenerationDefinition
{
    public required string Title { get; init; }
    public required string Purpose { get; init; }
    public required string Audience { get; init; }
    public string Language { get; init; } = "ja";
    public required DocumentFormat RequestedFormat { get; init; }
    public required string Instructions { get; init; }
    public bool UseReferencesAsFacts { get; init; } = true;
    public bool ProhibitUnsupportedClaims { get; init; } = true;
}
public sealed record ProjectDefinition
{
    public string FormatVersion { get; init; } = Formats.FormatVersions.Project;
    public required Guid ProjectId { get; init; }
    public required string Name { get; init; }
    public required ProjectMode Mode { get; init; }
    public TargetDocumentDefinition? Target { get; init; }
    public DocumentGenerationDefinition? Generation { get; init; }
    public IReadOnlyList<ReferenceDocumentDefinition> References { get; init; } = Array.Empty<ReferenceDocumentDefinition>();
    public required ChecklistDefinition Checklist { get; init; }
    public ChecklistOrigin Origin { get; init; } = new CreatedInProjectOrigin();
    public RepairPolicy DefaultRepairPolicy { get; init; } = RepairPolicy.SuggestOnly;
    public ValidationResult ValidateMode()
    {
        var issues = new List<DomainIssue>();
        if (Mode == ProjectMode.ExistingDocument)
        {
            if (Target is null) issues.Add(new("PROJECT_TARGET_REQUIRED", IssueSeverity.Error, "target", "既存文書モードでは主対象文書が必要です。"));
            if (Generation is not null) issues.Add(new("PROJECT_GENERATION_FORBIDDEN", IssueSeverity.Error, "generation", "既存文書モードでは文書生成設定を指定できません。"));
        }
        else
        {
            if (Generation is null) issues.Add(new("PROJECT_GENERATION_REQUIRED", IssueSeverity.Error, "generation", "文書生成モードでは生成設定が必要です。"));
            if (Target is not null) issues.Add(new("PROJECT_TARGET_FORBIDDEN", IssueSeverity.Error, "target", "文書生成モードでは主対象文書を指定できません。"));
            if (Generation?.RequestedFormat == DocumentFormat.Pdf) issues.Add(new("PROJECT_GENERATION_PDF_UNSUPPORTED", IssueSeverity.Error, "generation.requestedFormat", "PDFは生成形式として選択できません。"));
        }
        return ValidationResult.FromIssues(issues);
    }
}
