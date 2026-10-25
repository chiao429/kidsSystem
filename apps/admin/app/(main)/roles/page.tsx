import { revalidatePath } from 'next/cache';
import { Badge, Card, Field, Input, Select, Button } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import {
  ADMIN_ROLE_ID, DEFAULT_ROLES, PERMISSIONS, PERMISSION_GROUPS, PERMISSION_KEYS, PERMISSION_VERSION_TOKEN, ROLE_SCOPE_LABEL, RoleScope, resolveRoles,
} from '@kids/schema';
import { accounts, roles } from '@/lib/tables';

/** 新增或修改角色；內建角色第一次修改時寫入角色表 */
async function saveRole(roleId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  'use server';
  requireSession({ permission: 'roles' });
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const 名稱 = s('name');
  if (!名稱) return { error: '請填寫角色名稱' };
  const id = roleId || s('id');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { error: '角色代碼只能使用英數字、- 與 _' };
  const isAdmin = id === ADMIN_ROLE_ID;
  const picked = isAdmin ? PERMISSION_KEYS : formData.getAll('permissions').map(String).filter((p) => p in PERMISSIONS);
  const 權限 = [...picked, PERMISSION_VERSION_TOKEN].join(',');
  const 範圍 = isAdmin ? RoleScope.All : (Object.values(RoleScope) as string[]).includes(s('scope')) ? s('scope') : RoleScope.Own;
  const row = { 角色ID: id, 名稱, 權限, 範圍, 說明: s('note') };
  const table = roles();
  const existing = (await table.all({ fresh: true })).find((r) => r.角色ID === id);
  if (existing) {
    await table.updateByIds([{ id, changes: row }]);
  } else {
    if (!roleId && resolveRoles([]).has(id)) return { error: '角色代碼已被內建角色使用' };
    await table.append([row]);
  }
  revalidatePath('/roles');
  return { message: `已儲存「${名稱}」` };
}

async function deleteRole(roleId: string) {
  'use server';
  requireSession({ permission: 'roles' });
  if (DEFAULT_ROLES.some((r) => r.角色ID === roleId)) throw new Error('內建角色不能刪除');
  if ((await accounts().all({ fresh: true })).some((a) => a.角色 === roleId)) throw new Error('還有帳號使用這個角色，請先改掉這些帳號的角色');
  await roles().deleteByIds([roleId]);
  revalidatePath('/roles');
}

export default async function RolesPage() {
  requireSession({ permission: 'roles' });
  const [roleRows, accountRows] = await Promise.all([roles().all(), accounts().all()]);
  const list = [...resolveRoles(roleRows).values()];
  const noteOf = (id: string) => roleRows.find((r) => r.角色ID === id)?.說明 ?? DEFAULT_ROLES.find((r) => r.角色ID === id)?.說明 ?? '';
  const builtIn = new Set(DEFAULT_ROLES.map((r) => r.角色ID));
  return (
    <>
      <p className="text-sm text-gray-600">
        每個帳號屬於一個角色，角色決定選單上顯示哪些項目（沒勾的項目不會顯示，也無法進入）以及活動範圍。修改後，已登入的人需要重新登入才會套用。
      </p>
      {[...list, null].map((r) => {
        const isAdmin = r?.id === ADMIN_ROLE_ID;
        const count = r ? accountRows.filter((a) => a.角色 === r.id).length : 0;
        return (
          <Card
            key={r?.id ?? `new-${list.length}`}
            title={r ? <span>{r.name} <span className="font-mono text-xs text-gray-400">{r.id}</span></span> : '新增角色'}
            actions={r && <Badge tone="gray">{count} 個帳號</Badge>}
          >
            <ActionForm action={saveRole.bind(null, r?.id ?? '')} className="grid gap-3 sm:grid-cols-3">
              {!r && (
                <Field label="角色代碼" hint="英數字，建立後不可修改，例如 teacher">
                  <Input name="id" required />
                </Field>
              )}
              <Field label="名稱" required>
                <Input name="name" defaultValue={r?.name} required />
              </Field>
              <Field label="範圍">
                <Select name="scope" defaultValue={r?.scope ?? RoleScope.Own} disabled={isAdmin}>
                  {Object.values(RoleScope).map((s) => (
                    <option key={s} value={s}>
                      {ROLE_SCOPE_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="說明">
                <Input name="note" defaultValue={r ? noteOf(r.id) : ''} />
              </Field>
              <div className="sm:col-span-3">
                <div className="mb-1 text-sm font-medium text-gray-700">選單可以顯示的項目{isAdmin && '（系統管理員固定擁有全部權限）'}</div>
                <div className="space-y-3">
                  {PERMISSION_GROUPS.map((g) => (
                    <div key={g.label} className="rounded-2xl border border-gray-200 px-4 py-3">
                      <div className="text-xs font-semibold text-gray-500">
                        {g.label}
                        {g.hint && <span className="ml-2 font-normal text-gray-400">{g.hint}</span>}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                        {g.keys.map((p) => (
                          <label key={p} className="flex items-center gap-1.5">
                            <input type="checkbox" name="permissions" value={p} defaultChecked={r?.permissions.includes(p)} disabled={isAdmin} />
                            {PERMISSIONS[p]}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 sm:col-span-3">
                <SubmitButton size="sm">{r ? '儲存' : '新增角色'}</SubmitButton>
              </div>
            </ActionForm>
            {r && !builtIn.has(r.id) && count === 0 && (
              <form action={deleteRole.bind(null, r.id)} className="mt-2">
                <Button size="sm" variant="ghost" className="text-red-600">
                  刪除角色
                </Button>
              </form>
            )}
          </Card>
        );
      })}
    </>
  );
}
