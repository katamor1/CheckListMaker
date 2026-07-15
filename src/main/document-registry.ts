import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { DocumentFormat, SelectedDocument } from '../shared/model.js';
import { sha256 } from './crypto.js';

const formatByExtension: Record<string, { format: DocumentFormat; mediaType: string; editable: boolean }> = {
  '.md': { format: 'md', mediaType: 'text/markdown', editable: true },
  '.txt': { format: 'txt', mediaType: 'text/plain', editable: true },
  '.docx': { format: 'docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', editable: true },
  '.pdf': { format: 'pdf', mediaType: 'application/pdf', editable: false }
};

interface RegistryEntry {
  bytes?: Uint8Array;
  sourcePath?: string;
}

export class DocumentRegistry {
  readonly #entries = new Map<string, RegistryEntry>();

  async registerPath(sourcePath: string, storedPath: string): Promise<SelectedDocument> {
    const extension = extname(sourcePath).toLowerCase();
    const descriptor = formatByExtension[extension];
    if (!descriptor) throw new Error('対応形式はMD、TXT、DOCX、PDFです。');
    const fileStat = await stat(sourcePath);
    if (!fileStat.isFile()) throw new Error('選択されたパスはファイルではありません。');
    if (fileStat.size > 512 * 1024 * 1024) throw new Error('ファイルが大きすぎます。');
    const bytes = await readFile(sourcePath);
    const token = randomUUID();
    this.#entries.set(token, { sourcePath });
    return {
      token,
      originalFileName: basename(sourcePath),
      storedPath,
      mediaType: descriptor.mediaType,
      sizeBytes: bytes.byteLength,
      sha256: sha256(bytes),
      format: descriptor.format,
      editable: descriptor.editable
    };
  }

  registerBytes(document: Omit<SelectedDocument, 'token'>, bytes: Uint8Array): SelectedDocument {
    const token = randomUUID();
    this.#entries.set(token, { bytes });
    return { ...document, token };
  }

  async resolve(token: string): Promise<Uint8Array> {
    const entry = this.#entries.get(token);
    if (!entry) throw new Error('文書データが見つかりません。ファイルを選択し直してください。');
    if (entry.bytes) return entry.bytes;
    if (!entry.sourcePath) throw new Error('文書データが見つかりません。');
    return readFile(entry.sourcePath);
  }

  clear(): void {
    this.#entries.clear();
  }
}
