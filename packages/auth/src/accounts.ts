import { AccountTable, ADMIN_ROLE_ID, RoleTable, normalizePhone, resolveRoles, splitList } from '@kids/schema';
import { SheetTable } from '@kids/sheets-core';
import { hashPassword, verifyPassword, type Session } from './crypto';

const SESSION_HOURS = 12;

const accountTable = () => new SheetTable('master', AccountTable, 'admin', { ttlMs: 60_000 });

/** 帳號可輸入手機號碼（含空白、dash 也可以）；其餘照原樣比對 */
export function normalizeAccount(input: string): string {
  const v = input.trim();
  const phone = normalizePhone(v);
  return /^09\d{8}$/.test(phone) ? phone : v;
}

async function loadRoles() {
  try {
    return resolveRoles(await new SheetTable('master', RoleTable, 'admin', { ttlMs: 60_000 }).all());
  } catch {
    return resolveRoles([]); // 角色分頁尚未建立：使用內建角色
  }
}

/**
 * 以「帳號」表驗證，權限依「角色」表（沒有資料時用內建角色）。
 * 帳號表還沒有任何系統管理員時，可用 ADMIN_BOOTSTRAP_PASSWORD 以帳號 admin 登入做初始設定。
 */
export async function authenticate(accountInput: string, password: string): Promise<Session | 'disabled' | null> {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const account = normalizeAccount(accountInput);
  let rows: Awaited<ReturnType<ReturnType<typeof accountTable>['all']>> = [];
  try {
    rows = await accountTable().all({ fresh: true });
  } catch (e) {
    // 帳號分頁尚未初始化時仍允許 bootstrap 登入
    console.warn('讀取帳號分頁失敗：', e);
  }
  const roles = await loadRoles();

  const bootstrap = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const hasAdmin = rows.some((r) => r.角色 === ADMIN_ROLE_ID && r.啟用 !== 'N');
  if (!hasAdmin && bootstrap && account === 'admin' && password === bootstrap) {
    const admin = roles.get(ADMIN_ROLE_ID)!;
    return {
      account: 'admin', name: '系統管理員', role: admin.id, roleName: admin.name, permissions: admin.permissions,
      scope: admin.scope, mustChangePassword: false, events: ['*'], team: '', exp,
    };
  }

  const row = rows.find((r) => r.帳號 === account);
  if (!row || !verifyPassword(password, row.密碼雜湊)) return null;
  if (row.啟用 === 'N') return 'disabled';
  const role = roles.get(row.角色) ?? roles.get('staff')!;
  return {
    account: row.帳號,
    name: row.名稱 || row.帳號,
    role: role.id,
    roleName: role.name,
    permissions: role.permissions,
    scope: role.scope,
    mustChangePassword: row.需改密碼 === 'Y',
    events: splitList(row.可管理活動),
    team: row.小隊 ?? '',
    exp,
  };
}

/** 新帳號／重設密碼：預設密碼為手機號碼，並要求下次登入改密碼 */
export function defaultPasswordFields(phone: string) {
  return { 密碼雜湊: hashPassword(phone), 需改密碼: 'Y' };
}

/** 驗證舊密碼後設定新密碼，並清除「需改密碼」 */
export async function changePassword(account: string, current: string, next: string): Promise<string | null> {
  if (next.length < 8) return '新密碼至少 8 碼';
  if (next === account) return '新密碼不能和帳號（手機號碼）相同';
  if (next === current) return '新密碼不能和目前密碼相同';
  const table = accountTable();
  const row = (await table.all({ fresh: true })).find((r) => r.帳號 === account);
  if (!row || !verifyPassword(current, row.密碼雜湊)) return '目前密碼不正確';
  await table.updateByIds([{ id: account, changes: { 密碼雜湊: hashPassword(next), 需改密碼: '' } }]);
  return null;
}
