import 'server-only';
import { newId, nowString } from '@kids/schema';
import type { Session } from '@kids/auth';
import { logs } from './tables';

export async function writeLog(sheetId: string, session: Session, 動作: string, 對象ID = '', 內容 = '') {
  try {
    await logs(sheetId).append([
      { 日誌ID: newId('日誌ID'), 時間: nowString(), 系統: 'admin', 操作者: session.name, 動作, 對象ID, 內容 },
    ]);
  } catch (e) {
    console.error('寫入日誌失敗', e);
  }
}
