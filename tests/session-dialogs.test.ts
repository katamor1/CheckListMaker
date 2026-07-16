import { describe, expect, it } from 'vitest';
import {
  CLOSE_FLUSH_TIMEOUT_MESSAGE,
  decisionForDialogResponse,
  unsavedDialogOptions
} from '../src/main/session-dialogs.js';

describe('session dialogs', () => {
  it('builds the exact Japanese unsaved-changes dialog in safe button order', () => {
    expect(unsavedDialogOptions('月次チェックリスト')).toEqual({
      type: 'warning',
      title: '未保存の変更があります',
      message: '月次チェックリストには未保存の変更があります。',
      detail: '保存してから続行するか、変更を破棄するか選択してください。',
      buttons: ['保存して続行', '保存せずに続行', 'キャンセル'],
      defaultId: 2,
      cancelId: 2,
      noLink: true
    });
  });

  it('defaults both the focused action and dialog dismissal to cancel', () => {
    const options = unsavedDialogOptions('テスト');

    expect(options.defaultId).toBe(2);
    expect(options.cancelId).toBe(2);
    expect(options.buttons[options.cancelId]).toBe('キャンセル');
  });

  it.each([
    [0, 'save'],
    [1, 'discard'],
    [2, 'cancel'],
    [-1, 'cancel'],
    [3, 'cancel'],
    [Number.NaN, 'cancel']
  ] as const)('maps dialog response %s to %s', (response, expected) => {
    expect(decisionForDialogResponse(response)).toBe(expected);
  });

  it('provides a fixed safe message when renderer flush cannot be confirmed', () => {
    expect(CLOSE_FLUSH_TIMEOUT_MESSAGE).toBe(
      '最新の編集内容を確認できないため、終了を中止しました。もう一度操作してください。'
    );
  });
});
