import type { RoleTable, RowOf } from './tables';

/** 可授權的系統／功能 */
export const PERMISSIONS = {
  admin: '系統管理後台',
  'data-tools': '分組分隊',
  checkin: '報到',
  rollcall: '點名',
  import: '匯入舊資料',
  accounts: '帳號與角色管理',
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/**
 * 範圍：
 * - all：所有活動、所有分組（可新增活動）
 * - assigned：帳號「可管理活動」指定的活動、該活動所有分組
 * - own：指定的活動，且點名只限自己負責的分組
 */
export const RoleScope = { All: 'all', Assigned: 'assigned', Own: 'own' } as const;
export type RoleScope = (typeof RoleScope)[keyof typeof RoleScope];
export const ROLE_SCOPE_LABEL: Record<RoleScope, string> = {
  all: '所有活動',
  assigned: '指派的活動',
  own: '指派的活動，只限自己負責的分組',
};

export type RoleRow = RowOf<typeof RoleTable>;

/** 內建角色（角色表沒有資料時使用；ID 與舊帳號的角色值相同，舊帳號不需修改） */
export const DEFAULT_ROLES: RoleRow[] = [
  { 角色ID: 'admin', 名稱: '系統管理員', 權限: PERMISSION_KEYS.join(','), 範圍: 'all', 說明: '全部功能，含帳號與角色管理' },
  { 角色ID: 'manager', 名稱: '領袖', 權限: 'admin,data-tools,checkin,rollcall,import', 範圍: 'assigned', 說明: '負責指派活動的後台、分組、報到、點名' },
  { 角色ID: 'staff', 名稱: '同工', 權限: 'checkin,rollcall', 範圍: 'own', 說明: '報到，以及點名自己負責的分組' },
];

/** 系統管理員角色：不可刪除，也不可移除帳號與角色管理權限，避免把自己鎖在外面 */
export const ADMIN_ROLE_ID = 'admin';

export interface ResolvedRole {
  id: string;
  name: string;
  permissions: Permission[];
  scope: RoleScope;
}

/** 合併角色表與內建角色（角色表有同 ID 時以角色表為準） */
export function resolveRoles(rows: RoleRow[]): Map<string, ResolvedRole> {
  const map = new Map<string, ResolvedRole>();
  for (const r of [...DEFAULT_ROLES, ...rows]) {
    const permissions = r.權限.split(',').map((s) => s.trim()).filter((p): p is Permission => p in PERMISSIONS);
    const scope = (Object.values(RoleScope) as string[]).includes(r.範圍) ? (r.範圍 as RoleScope) : RoleScope.Own;
    map.set(r.角色ID, { id: r.角色ID, name: r.名稱 || r.角色ID, permissions, scope });
  }
  const admin = map.get(ADMIN_ROLE_ID)!;
  admin.permissions = PERMISSION_KEYS;
  admin.scope = RoleScope.All;
  return map;
}
