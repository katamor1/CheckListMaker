import { nextReferenceId } from '../shared/defaults.js';
import type {
  ProjectDefinition,
  ReferenceDocumentDefinition,
  SelectedDocument
} from '../shared/model.js';

const extensionFor = (document: SelectedDocument): string => {
  const match = /\.([^.]+)$/.exec(document.originalFileName);
  return match?.[1]?.toLowerCase() ?? document.format;
};

const titleFor = (fileName: string): string => {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(0, lastDot) : fileName;
};

export const appendSelectedReferences = (
  project: ProjectDefinition,
  documents: readonly SelectedDocument[]
): ProjectDefinition => {
  let current = project;
  const references = [...project.references];

  for (const document of documents) {
    const id = nextReferenceId({ ...current, references });
    const extension = extensionFor(document);
    references.push({
      id,
      document: {
        ...document,
        storedPath: `references/${id}.${extension}`
      },
      title: titleFor(document.originalFileName),
      purpose: '',
      authorityLevel: 'reference',
      priority: 50,
      roleIds: [],
      readOnly: true
    });
    current = { ...current, references };
  }

  if (references.length === project.references.length) return project;
  return {
    ...project,
    references,
    updatedAt: new Date().toISOString()
  };
};

export const updateReference = (
  references: readonly ReferenceDocumentDefinition[],
  referenceId: string,
  update: (reference: ReferenceDocumentDefinition) => ReferenceDocumentDefinition
): ReferenceDocumentDefinition[] =>
  references.map((reference) => reference.id === referenceId ? update(reference) : reference);

export const removeReference = (
  references: readonly ReferenceDocumentDefinition[],
  referenceId: string
): ReferenceDocumentDefinition[] => references.filter((reference) => reference.id !== referenceId);
