import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { sha256 } from './crypto.js';

const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_ENTRIES = 1024;
const FIXED_ZIP_DATE = new Date(1980, 0, 1, 0, 0, 0);

export interface ManifestEntry {
  path: string;
  role: string;
  mediaType: string;
  bytes: number;
  sha256: string;
  readOnly: boolean;
  originalFileName?: string;
}

export interface ArchiveManifest {
  formatVersion: '1.0';
  entries: ManifestEntry[];
}

export interface ArchiveFile {
  path: string;
  role: string;
  mediaType: string;
  bytes: Uint8Array;
  readOnly: boolean;
  originalFileName?: string;
}

export const assertSafeArchivePath = (value: string): void => {
  if (!value || value.startsWith('/') || value.includes('\\') || /^[A-Za-z]:/.test(value)) {
    throw new Error(`安全でないアーカイブパスです: ${value}`);
  }
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`安全でないアーカイブパスです: ${value}`);
  }
  if (!/^[\x20-\x7E]+$/.test(value)) {
    throw new Error(`アーカイブ内部パスはASCIIである必要があります: ${value}`);
  }
};

const createManifest = (files: readonly ArchiveFile[]): ArchiveManifest => ({
  formatVersion: '1.0',
  entries: [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => ({
      path: file.path,
      role: file.role,
      mediaType: file.mediaType,
      bytes: file.bytes.byteLength,
      sha256: sha256(file.bytes),
      readOnly: file.readOnly,
      ...(file.originalFileName === undefined ? {} : { originalFileName: file.originalFileName })
    }))
});

const replaceFileSafely = async (temporary: string, destination: string): Promise<void> => {
  const backup = `${destination}.backup-${randomUUID()}`;
  let hadOriginal = false;
  try {
    await stat(destination);
    hadOriginal = true;
  } catch {
    hadOriginal = false;
  }

  if (!hadOriginal) {
    await rename(temporary, destination);
    return;
  }

  await rename(destination, backup);
  try {
    await rename(temporary, destination);
    await rm(backup, { force: true });
  } catch (error) {
    await rm(destination, { force: true });
    await rename(backup, destination);
    throw error;
  }
};

export const writeArchive = async (destination: string, files: readonly ArchiveFile[]): Promise<ArchiveManifest> => {
  if (files.length === 0 || files.length > MAX_ENTRIES - 1) throw new Error('アーカイブのファイル数が許容範囲外です。');
  const unique = new Set<string>();
  let total = 0;
  for (const file of files) {
    assertSafeArchivePath(file.path);
    if (file.path === 'manifest.json') throw new Error('manifest.jsonは自動生成されます。');
    if (unique.has(file.path)) throw new Error(`アーカイブパスが重複しています: ${file.path}`);
    unique.add(file.path);
    if (file.bytes.byteLength > MAX_ENTRY_BYTES) throw new Error(`ファイルが大きすぎます: ${file.path}`);
    total += file.bytes.byteLength;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error('アーカイブの展開後合計サイズが大きすぎます。');

  const manifest = createManifest(files);
  const zippable: Zippable = {};
  for (const file of [...files].sort((left, right) => left.path.localeCompare(right.path))) {
    zippable[file.path] = [file.bytes, { level: 6, mtime: FIXED_ZIP_DATE }];
  }
  zippable['manifest.json'] = [strToU8(`${JSON.stringify(manifest, null, 2)}\n`), { level: 6, mtime: FIXED_ZIP_DATE }];
  const archive = zipSync(zippable, { level: 6, mtime: FIXED_ZIP_DATE });
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error('生成したアーカイブが大きすぎます。');

  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporary, archive, { flag: 'wx' });
    const verification = await readArchive(temporary);
    if (verification.manifest.entries.length !== manifest.entries.length) throw new Error('保存後検証でファイル数が一致しません。');
    await replaceFileSafely(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
  return manifest;
};

export const readArchive = async (source: string): Promise<{ manifest: ArchiveManifest; entries: Map<string, Uint8Array> }> => {
  const sourceStat = await stat(source);
  if (sourceStat.size > MAX_ARCHIVE_BYTES) throw new Error('アーカイブが大きすぎます。');
  const archive = await readFile(source);
  let decoded: Record<string, Uint8Array>;
  try {
    decoded = unzipSync(archive);
  } catch (error) {
    throw new Error(`ZIPを展開できません: ${error instanceof Error ? error.message : String(error)}`);
  }
  const names = Object.keys(decoded);
  if (names.length === 0 || names.length > MAX_ENTRIES) throw new Error('アーカイブのファイル数が許容範囲外です。');
  let total = 0;
  for (const name of names) {
    assertSafeArchivePath(name);
    const data = decoded[name];
    if (!data) throw new Error(`ZIPエントリを読み取れません: ${name}`);
    if (data.byteLength > MAX_ENTRY_BYTES) throw new Error(`ZIPエントリが大きすぎます: ${name}`);
    total += data.byteLength;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error('展開後サイズが大きすぎます。');

  const manifestBytes = decoded['manifest.json'];
  if (!manifestBytes) throw new Error('manifest.jsonがありません。');
  let manifest: ArchiveManifest;
  try {
    manifest = JSON.parse(strFromU8(manifestBytes)) as ArchiveManifest;
  } catch {
    throw new Error('manifest.jsonを解析できません。');
  }
  if (manifest.formatVersion !== '1.0' || !Array.isArray(manifest.entries)) throw new Error('未対応のアーカイブ形式です。');

  const declared = new Set(manifest.entries.map((entry) => entry.path));
  const actual = names.filter((name) => name !== 'manifest.json');
  if (actual.length !== declared.size || actual.some((name) => !declared.has(name))) throw new Error('manifest.jsonとZIP内容が一致しません。');
  for (const entry of manifest.entries) {
    assertSafeArchivePath(entry.path);
    const data = decoded[entry.path];
    if (!data || data.byteLength !== entry.bytes || sha256(data) !== entry.sha256) throw new Error(`ファイル検証に失敗しました: ${entry.path}`);
  }
  return { manifest, entries: new Map(actual.map((name) => [name, decoded[name] as Uint8Array])) };
};
