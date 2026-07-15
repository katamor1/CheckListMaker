import { randomUUID } from 'node:crypto';
import { strFromU8 } from 'fflate';
import type { ArchiveFile } from './archive.js';
import { readArchive, writeArchive } from './archive.js';
import { canonicalJson, jsonBytes, sha256 } from './crypto.js';
import { DocumentRegistry } from './document-registry.js';
import type { ChecklistDefinition, ChecklistTemplateDefinition, ProjectDefinition, SelectedDocument } from '../shared/model.js';
import { FORMAT_VERSION } from '../shared/model.js';
import {
  assertPersistedProjectDefinition,
  assertProjectDefinition,
  assertRecord
} from '../shared/project-structure.js';

const cloneWithoutTokens = (project: ProjectDefinition): ProjectDefinition => ({
  ...project,
  ...(project.target ? { target: { ...project.target, token: '' } } : {}),
  references: project.references.map((reference) => ({
    ...reference,
    document: { ...reference.document, token: '' }
  }))
});

const parseJson = <T>(bytes: Uint8Array, label: string): T => {
  try {
    return JSON.parse(strFromU8(bytes)) as T;
  } catch {
    throw new Error(`${label}を解析できません。`);
  }
};

const requireEntry = (entries: Map<string, Uint8Array>, path: string): Uint8Array => {
  const value = entries.get(path);
  if (!value) throw new Error(`${path}がありません。`);
  return value;
};

export class ProjectStore {
  constructor(private readonly registry: DocumentRegistry) {}

  async saveProject(destination: string, project: ProjectDefinition): Promise<void> {
    const persisted = cloneWithoutTokens(project);
    const { checklist, ...metadata } = persisted;
    const files: ArchiveFile[] = [
      { path: 'project.json', role: 'project', mediaType: 'application/json', bytes: jsonBytes(metadata), readOnly: true },
      { path: 'checklist.json', role: 'checklist', mediaType: 'application/json', bytes: jsonBytes(checklist), readOnly: true }
    ];

    if (project.mode === 'existing_document') {
      if (!project.target) throw new Error('主対象文書がありません。');
      files.push(await this.#assetFile(project.target, 'target'));
    } else {
      if (!project.generation) throw new Error('文書生成設定がありません。');
      files.push({
        path: 'generation/document-generation.json',
        role: 'generation_instruction',
        mediaType: 'application/json',
        bytes: jsonBytes(project.generation),
        readOnly: true
      });
    }

    for (const reference of project.references) files.push(await this.#assetFile(reference.document, 'reference'));
    await writeArchive(destination, files);
  }

  async openProject(source: string): Promise<ProjectDefinition> {
    const { entries } = await readArchive(source);
    const metadata = parseJson<unknown>(requireEntry(entries, 'project.json'), 'project.json');
    const checklist = parseJson<unknown>(requireEntry(entries, 'checklist.json'), 'checklist.json');
    assertRecord(metadata);
    const persisted: unknown = { ...metadata, checklist };
    assertPersistedProjectDefinition(persisted);

    const target = persisted.target
      ? this.#restoreDocument(persisted.target, requireEntry(entries, persisted.target.storedPath))
      : undefined;
    const references = persisted.references.map((reference) => ({
      ...reference,
      document: this.#restoreDocument(reference.document, requireEntry(entries, reference.document.storedPath))
    }));
    const restored = {
      ...persisted,
      ...(target ? { target } : {}),
      references
    };
    assertProjectDefinition(restored);
    return restored;
  }

  async saveTemplate(destination: string, project: ProjectDefinition, existing?: ChecklistTemplateDefinition): Promise<ChecklistTemplateDefinition> {
    const now = new Date().toISOString();
    const semantic = {
      name: project.checklist.name,
      description: project.checklist.description,
      defaultRepairPolicy: project.defaultRepairPolicy,
      checklist: project.checklist
    };
    const contentSha256 = sha256(canonicalJson(semantic));
    const revision = existing && existing.contentSha256 !== contentSha256 ? existing.revision + 1 : existing?.revision ?? 1;
    const template: ChecklistTemplateDefinition = {
      formatVersion: FORMAT_VERSION,
      templateId: existing?.templateId ?? randomUUID(),
      revision,
      ...(existing?.versionLabel === undefined ? {} : { versionLabel: existing.versionLabel }),
      name: project.checklist.name,
      ...(project.checklist.description === undefined ? {} : { description: project.checklist.description }),
      defaultRepairPolicy: project.defaultRepairPolicy,
      checklist: project.checklist,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      contentSha256
    };
    const { checklist, ...metadata } = template;
    await writeArchive(destination, [
      { path: 'template.json', role: 'template', mediaType: 'application/json', bytes: jsonBytes(metadata), readOnly: true },
      { path: 'checklist.json', role: 'checklist', mediaType: 'application/json', bytes: jsonBytes(checklist), readOnly: true }
    ]);
    return template;
  }

  async openTemplate(source: string): Promise<ChecklistTemplateDefinition> {
    const { entries } = await readArchive(source);
    const metadata = parseJson<Omit<ChecklistTemplateDefinition, 'checklist'>>(requireEntry(entries, 'template.json'), 'template.json');
    const checklist = parseJson<ChecklistDefinition>(requireEntry(entries, 'checklist.json'), 'checklist.json');
    if (metadata.formatVersion !== FORMAT_VERSION) throw new Error('未対応のテンプレート形式です。');
    const expected = sha256(canonicalJson({ name: checklist.name, description: checklist.description, defaultRepairPolicy: metadata.defaultRepairPolicy, checklist }));
    if (metadata.contentSha256 !== expected) throw new Error('テンプレート内容のハッシュが一致しません。');
    return { ...metadata, checklist };
  }

  async #assetFile(document: SelectedDocument, role: 'target' | 'reference'): Promise<ArchiveFile> {
    const bytes = await this.registry.resolve(document.token);
    if (sha256(bytes) !== document.sha256 || bytes.byteLength !== document.sizeBytes) throw new Error(`${document.originalFileName} は登録時から変更されています。選択し直してください。`);
    return {
      path: document.storedPath,
      role,
      mediaType: document.mediaType,
      bytes,
      readOnly: role === 'reference' || !document.editable,
      originalFileName: document.originalFileName
    };
  }

  #restoreDocument(document: SelectedDocument, bytes: Uint8Array): SelectedDocument {
    const { token: _discarded, ...withoutToken } = document;
    if (withoutToken.sizeBytes !== bytes.byteLength || withoutToken.sha256 !== sha256(bytes)) throw new Error(`${withoutToken.storedPath} の内容が一致しません。`);
    return this.registry.registerBytes(withoutToken, bytes);
  }
}
