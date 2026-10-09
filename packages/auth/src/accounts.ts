import { AccountTable, Role, splitList } from '@kids/schema';
import { SheetTable } from '@kids/sheets-core';
import { verifyPassword, type Session } from './crypto';

const SESSION_HOURS = 12;

/**
 * 以「帳號」分頁驗證。
 * 帳號分頁還沒有任何 admin 時，可用 ADMIN_BOOTSTRAP_PASSWORD 以帳號 admin 登入做初始設定。
 */
export async function authenticate(account: string, password: string): Promise<Session | null> {
  const masterId = process.env.GOOGLE_MASTER_SHEET_ID ?? '';
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  let rows: Awaited<ReturnType<SheetTable<typeof AccountTable>['all']>> = [];
  try {
    rows = await new SheetTable(masterId, AccountTable, 60_000).all();
  } catch (e) {
    // 帳號分頁尚未初始化時仍允許 bootstrap 登入
    console.warn('讀取帳號分頁失敗：', e);
  }

  const bootstrap = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const hasAdmin = rows.some((r) => r.角色 === Role.Admin && r.啟用 !== 'N');
  if (!hasAdmin && bootstrap && account === 'admin' && password === bootstrap) {
    return { account: 'admin', name: '系統管理員', role: Role.Admin, events: ['*'], team: '', exp };
  }

  const row = rows.find((r) => r.帳號 === account);
  if (!row || row.啟用 === 'N' || !verifyPassword(password, row.密碼雜湊)) return null;
  const role = (Object.values(Role) as string[]).includes(row.角色) ? (row.角色 as Role) : Role.Staff;
  return {
    account: row.帳號,
    name: row.名稱 || row.帳號,
    role,
    events: splitList(row.可管理活動),
    team: row.小隊 ?? '',
    exp,
  };
}
