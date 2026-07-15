export const FORMAT_VERSION = '1.0' as const;
export const APPLICATION_VERSION = '0.1.0' as const;

export type ProjectMode = 'existing_document' | 'document_generation';
export type DocumentFormat = 'md' | 'txt' | 'docx' | 'pdf';
export type AuthorityLevel = 'binding' | 'approved' | 'working' | 'reference';
export type RepairPolicy = 'auto_fix' | 'suggest_only' | 'do_not_modify';
export type ConditionLogic = 'all' | 'any';
export type NotFoundBehavior = 'invalid' | 'needs_information';
export type Confidence = 'high' | 'medium' | 'low';

export type ScopeDefinition =
  | { type: 'entire_document'; onNotFound: NotFoundBehavior }
  | { type: 'section'; heading: string; matchMode: 'exact' | 'semantic'; includeSubsections: boolean; onNotFound: NotFoundBehavior }
  | { type: 'table'; description: string; expectedColumns: string[]; onNotFound: NotFoundBehavior }
  | { type: 'semantic_locator'; description: string; onNotFound: NotFoundBehavior };

interface ConditionBase {
  id: string;
  scope: ScopeDefinition;
}

export type ConditionDefinition =
  | (ConditionBase & { type: 'semantic'; instruction: string })
  | (ConditionBase & { type: 'required_text'; values: string[]; matchMode: 'all' | 'any'; caseSensitive: boolean })
  | (ConditionBase & { type: 'forbidden_text'; values: string[]; caseSensitive: boolean })
  | (ConditionBase & { type: 'number'; subject: string; operator: 'equal' | 'not_equal' | 'less_than' | 'less_than_or_equal' | 'greater_than' | 'greater_than_or_equal' | 'between'; value?: number; minimum?: number; maximum?: number; unit?: string })
  | (ConditionBase & { type: 'length_or_count'; measure: 'characters' | 'words' | 'paragraphs' | 'headings' | 'list_items' | 'occurrences'; operator: 'equal' | 'less_than_or_equal' | 'greater_than_or_equal' | 'between'; value?: number; minimum?: number; maximum?: number; occurrenceText?: string })
  | (ConditionBase & { type: 'date_or_deadline'; subject: string; operator: 'exists' | 'on' | 'before' | 'on_or_before' | 'after' | 'on_or_after' | 'between' | 'start_on_or_before_end'; value?: string; minimum?: string; maximum?: string })
  | (ConditionBase & { type: 'pattern'; preset: 'email' | 'url' | 'phone' | 'postal_code' | 'iso_date' | 'management_number' | 'custom'; pattern: string; description: string })
  | (ConditionBase & { type: 'one_of'; subject: string; allowedValues: string[] })
  | (ConditionBase & { type: 'cross_source_consistency'; instruction: string; sourceIds: string[] });

export interface CheckItemDefinition {
  id: string;
  title: string;
  description?: string;
  required: boolean;
  allowNotApplicable: boolean;
  conditionLogic: ConditionLogic;
  repairPolicy?: RepairPolicy;
  conditions: ConditionDefinition[];
  notes?: string;
}

export interface ReferenceRoleDefinition {
  roleId: string;
  name: string;
  description?: string;
  required: boolean;
  recommendedAuthorityLevel: AuthorityLevel;
}

export interface ChecklistDefinition {
  name: string;
  description?: string;
  items: CheckItemDefinition[];
  retiredCheckItemIds: string[];
  retiredConditionIds: string[];
  requiredReferenceRoles: ReferenceRoleDefinition[];
}

export interface SelectedDocument {
  token: string;
  originalFileName: string;
  storedPath: string;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  format: DocumentFormat;
  editable: boolean;
}

export interface ReferenceDocumentDefinition {
  id: string;
  document: SelectedDocument;
  title: string;
  purpose: string;
  authorityLevel: AuthorityLevel;
  priority: number;
  effectiveDate?: string;
  roleIds: string[];
  readOnly: true;
}

export interface DocumentGenerationDefinition {
  title: string;
  purpose: string;
  audience: string;
  language: string;
  requestedFormat: Exclude<DocumentFormat, 'pdf'>;
  instructions: string;
  useReferencesAsFacts: boolean;
  prohibitUnsupportedClaims: boolean;
}

export interface ChecklistOrigin {
  type: 'created_in_project' | 'template';
  templateId?: string;
  templateName?: string;
  revision?: number;
  versionLabel?: string;
  importedAt?: string;
  sourceSha256?: string;
  modifiedAfterImport?: boolean;
}

export interface ProjectDefinition {
  formatVersion: typeof FORMAT_VERSION;
  projectId: string;
  name: string;
  mode: ProjectMode;
  target?: SelectedDocument;
  generation?: DocumentGenerationDefinition;
  references: ReferenceDocumentDefinition[];
  checklist: ChecklistDefinition;
  origin: ChecklistOrigin;
  defaultRepairPolicy: RepairPolicy;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistTemplateDefinition {
  formatVersion: typeof FORMAT_VERSION;
  templateId: string;
  revision: number;
  versionLabel?: string;
  name: string;
  description?: string;
  purpose?: string;
  defaultRepairPolicy: RepairPolicy;
  checklist: ChecklistDefinition;
  createdAt: string;
  updatedAt: string;
  contentSha256: string;
}

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  section: 'overview' | 'document' | 'references' | 'checklist' | 'generation' | 'package';
  entityId?: string;
  field?: string;
  message: string;
  remediation: string;
}

export interface ProjectSummary {
  path?: string;
  project: ProjectDefinition;
  dirty: boolean;
}

export interface SessionSnapshot extends ProjectSummary {
  revision: number;
}

export interface ExportResult {
  canceled: boolean;
  path?: string;
  packageId?: string;
  fileCount?: number;
  sizeBytes?: number;
}

export interface OpenResult {
  canceled: boolean;
  summary?: ProjectSummary;
}

export interface SaveResult {
  canceled: boolean;
  path?: string;
  project?: ProjectDefinition;
}

export interface SessionSaveResult extends SaveResult {
  summary: SessionSnapshot;
}

export interface SessionChangeResult {
  canceled: boolean;
  summary?: SessionSnapshot;
}

export interface DraftUpdateResult {
  accepted: boolean;
  revision: number;
}

export interface SelectedReferenceInput {
  document: SelectedDocument;
  title: string;
  purpose: string;
  authorityLevel: AuthorityLevel;
  priority: number;
}

export interface AppBridge {
  newProject(mode: ProjectMode): Promise<ProjectSummary>;
  openProject(): Promise<OpenResult>;
  saveProject(project: ProjectDefinition, saveAs?: boolean): Promise<SaveResult>;
  selectTarget(): Promise<SelectedDocument | null>;
  selectReferences(): Promise<SelectedDocument[]>;
  exportPackage(project: ProjectDefinition): Promise<ExportResult>;
  validateProject(project: ProjectDefinition): Promise<ValidationIssue[]>;
  saveTemplate(project: ProjectDefinition): Promise<SaveResult>;
  openTemplate(): Promise<ChecklistTemplateDefinition | null>;
  openFolder(path: string): Promise<void>;
  getVersions(): Promise<{ application: string; electron: string; node: string; chrome: string }>;
}

declare global {
  interface Window {
    checklistMaker: AppBridge;
  }
}
