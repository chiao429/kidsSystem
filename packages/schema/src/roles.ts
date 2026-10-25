import type { RoleTable, RowOf } from './tables';

/** 可授權的功能：每一項對應一個選單項目，勾了才會顯示、才能進入 */
export const PERMISSIONS = {
  admin: '活動',
  families: '家庭',
  signatures: '簽名檔',
  accounts: '帳號',
  roles: '角色權限',
  setup: '初始化',
  checkin: '報到',
  rollcall: '點名',
  'data-tools': '分組分隊',
  import: '匯入舊資料',
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

/** 角色權限頁的分組顯示；後台的其他項目都要搭配「活動」（進入系統管理後台）才有作用 */
export const PERMISSION_GROUPS: { label: string; hint?: string; keys: Permission[] }[] = [
  { label: '系統管理後台', hint: '「活動」是進入後台的權限，其他項目需一併勾選「活動」', keys: ['admin', 'families', 'signatures', 'accounts', 'roles', 'setup'] },
  { label: '其他系統', keys: ['checkin', 'rollcall', 'data-tools', 'import'] },
];

/** 寫在角色權限欄位裡的版本標記：沒有這個標記的舊角色依舊規則換算（見 resolveRoles） */
export const PERMISSION_VERSION_TOKEN = 'v2';

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
  { 角色ID: 'manager', 名稱: '領袖', 權限: 'admin,families,data-tools,checkin,rollcall,import,v2', 範圍: 'assigned', 說明: '負責指派活動的後台、分組、報到、點名' },
  { 角色ID: 'staff', 名稱: '同工', 權限: 'checkin,rollcall,v2', 範圍: 'own', 說明: '報到，以及點名自己負責的分組' },
];

/** 各系統入口（統一入口下的路徑）；選單依帳號權限顯示可以使用的系統，取代原本的「同工入口」頁 */
export const SYSTEM_LINKS: { href: string; label: string; permission: Permission }[] = [
  { href: '/admin', label: '系統管理後台', permission: 'admin' },
  { href: '/checkin', label: '報到', permission: 'checkin' },
  { href: '/rollcall', label: '點名', permission: 'rollcall' },
  { href: '/data-tools', label: '分組分隊', permission: 'data-tools' },
  { href: '/import', label: '匯入舊資料', permission: 'import' },
];

/** 這個帳號可以使用的其他系統（不含目前所在的系統） */
export function systemLinksFor(permissions: readonly string[], current: string) {
  return SYSTEM_LINKS.filter((s) => s.href !== current && permissions.includes(s.permission)).map(({ href, label }) => ({ href, label }));
}

/** 系統管理員角色：不可刪除，也不可移除帳號與角色管理權限，避免把自己鎖在外面 */
export const ADMIN_ROLE_ID = 'admin';

export interface ResolvedRole {
  id: string;
  name: string;
  permissions: Permission[];
  scope: RoleScope;
}

/**
 * 舊版權限（還沒拆成選單項目）換算成新版：後台含家庭、所有活動範圍再含簽名檔；
 * 帳號與角色管理含角色權限、初始化。舊角色資料與拆分前登入的 session 都用這個換算。
 */
export function upgradeLegacyPermissions(permissions: Permission[], scope: RoleScope): Permission[] {
  const out = new Set(permissions);
  if (out.has('admin')) {
    out.add('families');
    if (scope === RoleScope.All) out.add('signatures');
  }
  if (out.has('accounts')) {
    out.add('roles');
    out.add('setup');
  }
  return [...out];
}

/** 合併角色表與內建角色（角色表有同 ID 時以角色表為準） */
export function resolveRoles(rows: RoleRow[]): Map<string, ResolvedRole> {
  const map = new Map<string, ResolvedRole>();
  for (const r of [...DEFAULT_ROLES, ...rows]) {
    const tokens = r.權限.split(',').map((s) => s.trim());
    const permissions = tokens.filter((p): p is Permission => p in PERMISSIONS);
    const scope = (Object.values(RoleScope) as string[]).includes(r.範圍) ? (r.範圍 as RoleScope) : RoleScope.Own;
    map.set(r.角色ID, { id: r.角色ID, name: r.名稱 || r.角色ID, permissions: tokens.includes(PERMISSION_VERSION_TOKEN) ? permissions : upgradeLegacyPermissions(permissions, scope), scope });
  }
  const admin = map.get(ADMIN_ROLE_ID)!;
  admin.permissions = PERMISSION_KEYS;
  admin.scope = RoleScope.All;
  return map;
}
