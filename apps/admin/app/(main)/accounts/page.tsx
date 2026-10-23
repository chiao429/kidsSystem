import { revalidatePath } from 'next/cache';
import { Badge, Card, Field, Input, Select, Table, Button, withBase } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import { defaultPasswordFields, normalizeAccount } from '@kids/auth';
import { requireSession } from '@kids/auth/next';
import { ADMIN_ROLE_ID, ROLE_SCOPE_LABEL, normalizePhone, resolveRoles } from '@kids/schema';
import { accounts, roles } from '@/lib/tables';

const isPhone = (v: string) => /^09\d{8}$/.test(v);

/** 新增帳號：帳號為手機號碼，預設密碼同手機號碼，第一次登入需改密碼 */
async function saveAccount(_: FormResult, formData: FormData): Promise<FormResult> {
  'use server';
  const session = requireSession({ permission: 'accounts' });
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const editingId = s('editing');
  const 帳號 = editingId || normalizePhone(s('account'));
  if (!editingId && !isPhone(帳號)) return { error: '帳號請填手機號碼（09 開頭 10 碼）' };
  const roleMap = resolveRoles(await roles().all());
  const 角色 = s('role');
  if (!roleMap.has(角色)) return { error: '請選擇角色' };
  if (帳號 === session.account && 角色 !== session.role) return { error: '不能變更自己的角色' };
  if (帳號 === session.account && formData.get('enabled') !== 'on') return { error: '不能停用自己的帳號' };
  const changes = {
    名稱: s('displayName'),
    角色,
    可管理活動: s('events'),
    小隊: s('team'),
    啟用: formData.get('enabled') === 'on' ? 'Y' : 'N',
  };
  if (!changes.名稱) return { error: '請填寫姓名' };
  const table = accounts();
  const existing = await table.findById(帳號, { fresh: true });
  if (editingId) {
    if (!existing) return { error: '找不到此帳號' };
    await table.updateByIds([{ id: 帳號, changes }]);
    revalidatePath('/accounts');
    return { message: `已儲存 ${帳號}` };
  }
  if (existing) return { error: '此手機號碼已經有帳號' };
  await table.append([{ 帳號, ...changes, ...defaultPasswordFields(帳號) }]);
  revalidatePath('/accounts');
  return { message: `已建立 ${帳號}，預設密碼為手機號碼，第一次登入需改密碼` };
}

/** 重設密碼為手機號碼（舊帳號沒有手機號碼時重設為帳號本身），下次登入需改密碼 */
async function resetPassword(帳號: string) {
  'use server';
  requireSession({ permission: 'accounts' });
  await accounts().updateByIds([{ id: 帳號, changes: defaultPasswordFields(帳號) }]);
  revalidatePath('/accounts');
}

async function deleteAccount(帳號: string) {
  'use server';
  const session = requireSession({ permission: 'accounts' });
  if (帳號 === session.account) throw new Error('不能刪除自己');
  await accounts().deleteByIds([帳號]);
  revalidatePath('/accounts');
}

export default async function AccountsPage({ searchParams }: { searchParams: { edit?: string } }) {
  requireSession({ permission: 'accounts' });
  const [rows, roleRows] = await Promise.all([accounts().all(), roles().all()]);
  const roleMap = resolveRoles(roleRows);
  const editing = rows.find((r) => r.帳號 === searchParams.edit);
  return (
    <>
      <Card title={editing ? `編輯帳號：${editing.帳號}` : '新增帳號'}>
        <ActionForm action={saveAccount} className="grid gap-3 sm:grid-cols-3" key={editing?.帳號 ?? `new-${rows.length}`}>
          {editing && <input type="hidden" name="editing" value={editing.帳號} />}
          <Field label="帳號（手機號碼）" hint={editing ? undefined : '預設密碼與手機號碼相同，第一次登入會要求改密碼'} required>
            <Input name="account" inputMode="tel" defaultValue={editing?.帳號} readOnly={!!editing} required />
          </Field>
          <Field label="姓名（顯示為操作者）" required>
            <Input name="displayName" defaultValue={editing?.名稱} required />
          </Field>
          <Field label="角色" required>
            <Select name="role" defaultValue={editing ? (roleMap.has(editing.角色) ? editing.角色 : 'staff') : 'staff'}>
              {[...roleMap.values()].map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="可管理活動" hint="活動ID，以逗號分隔；* 表示全部（範圍為「所有活動」的角色不需填）">
            <Input name="events" defaultValue={editing?.可管理活動} />
          </Field>
          <Field label="負責小隊（舊欄位）" hint="建議改到活動的「分組」頁指派負責人；此欄以名稱比對，可留白">
            <Input name="team" defaultValue={editing?.小隊} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={editing ? editing.啟用 !== 'N' : true} /> 啟用
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <SubmitButton>{editing ? '儲存' : '建立帳號'}</SubmitButton>
            {editing && (
              <a href={withBase('/accounts')} className="px-3 py-2 text-sm text-gray-600">
                取消
              </a>
            )}
          </div>
        </ActionForm>
      </Card>
      <Card title="帳號列表">
        <Table head={['帳號', '姓名', '角色', '範圍', '可管理活動', '狀態', '']}>
          {rows.map((r) => {
            const role = roleMap.get(r.角色);
            return (
              <tr key={r.帳號}>
                <td className="px-2 py-2 font-mono text-xs">{r.帳號}</td>
                <td className="px-2 py-2">{r.名稱}</td>
                <td className="px-2 py-2">{role?.name ?? `${r.角色}（不存在）`}</td>
                <td className="px-2 py-2 text-xs text-gray-500">{role ? ROLE_SCOPE_LABEL[role.scope] : ''}</td>
                <td className="px-2 py-2">{role?.scope === 'all' ? '全部' : r.可管理活動}</td>
                <td className="space-x-1 px-2 py-2">
                  {r.啟用 === 'N' ? <Badge tone="red">停用</Badge> : <Badge tone="green">啟用</Badge>}
                  {r.需改密碼 === 'Y' && <Badge tone="amber">待改密碼</Badge>}
                </td>
                <td className="space-x-1 whitespace-nowrap px-2 py-2 text-right">
                  <a href={withBase(`/accounts?edit=${encodeURIComponent(r.帳號)}`)} className="text-purple-700 hover:underline">
                    編輯
                  </a>
                  <form action={resetPassword.bind(null, r.帳號)} className="inline">
                    <Button variant="ghost" size="sm">
                      重設密碼
                    </Button>
                  </form>
                  {r.角色 !== ADMIN_ROLE_ID || rows.filter((x) => x.角色 === ADMIN_ROLE_ID).length > 1 ? (
                    <form action={deleteAccount.bind(null, r.帳號)} className="inline">
                      <Button variant="ghost" size="sm" className="text-red-600">
                        刪除
                      </Button>
                    </form>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-2 text-xs text-gray-500">重設密碼後，密碼會變回帳號（手機號碼），下次登入需重新設定。</p>
      </Card>
    </>
  );
}
