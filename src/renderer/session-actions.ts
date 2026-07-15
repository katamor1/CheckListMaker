import type { AppBridge, ExportResult, SessionSnapshot } from '../shared/model.js';

type ExportBridge = Pick<AppBridge, 'saveProject' | 'exportPackage'>;

export const saveThenExport = async (
  snapshot: SessionSnapshot,
  bridge: ExportBridge,
  adoptSummary: (summary: SessionSnapshot) => void
): Promise<ExportResult> => {
  if (snapshot.dirty) {
    const saved = await bridge.saveProject(false);
    adoptSummary(saved.summary);
    if (saved.canceled) return { canceled: true };
    if (saved.summary.dirty) {
      throw new Error('保存中に新しい変更があったため、パッケージ作成を中止しました。');
    }
  }
  return bridge.exportPackage();
};
