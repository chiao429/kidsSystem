import { revalidatePath } from 'next/cache';
import { Badge, Card, Field, Input, Select, Table, Button, withBase } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import { hashPassword } from '@kids/auth';
import { requireSession } from '@kids/auth/next';
import { Role } from '@kids/schema';
import { accounts } from '@/lib/tables';

async function saveAccount(_: FormResult, formData: FormData): Promise<FormResult> {
  'use server';
  requireSession({ roles: ['admin'] });
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const 帳號 = s('account');
  if (!/^[A-Za-z0-9_.@-]+$/.test(帳號)) return { error: '帳號只能使用英數字與 _ . @ -' };
  const password = s('password');
  const changes = {
    名稱: s('displayName'),
    角色: s('role'),
    可管理活動: s('events'),
    小隊: s('team'),
    啟用: formData.get('enabled') === 'on' ? 'Y' : 'N',
    ...(password ? { 密碼雜湊: hashPassword(password) } : {}),
  };
  const table = accounts();
  const existing = await table.findById(帳號, { fresh: true });
  if (existing) {
    await table.updateByIds([{ id: 帳號, changes }]);
  } else {
    if (password.length < 8) return { error: '新帳號需要設定至少 8 碼的密碼' };
    await table.append([{ 帳號, ...changes }]);
  }
  revalidatePath('/accounts');
  return { message: `已儲存 ${帳號}` };
}

async function deleteAccount(帳號: string) {
  'use server';
  const session = requireSession({ roles: ['admin'] });
  if (帳號 === session.account) throw new Error('不能刪除自己');
  await accounts().deleteByIds([帳號]);
  revalidatePath('/accounts');
}

const roleLabel: Record<string, string> = { admin: '管理員', manager: '活動負責人', staff: '同工' };

export default async function AccountsPage({ searchParams }: { searchParams: { edit?: string } }) {
  requireSession({ roles: ['admin'] });
  const rows = await accounts().all();
  const editing = rows.find((r) => r.帳號 === searchParams.edit);
  return (
    <>
      <Card title={editing ? `編輯帳號：${editing.帳號}` : '新增帳號'}>
        <ActionForm action={saveAccount} className="grid gap-3 sm:grid-cols-3" key={editing?.帳號 ?? 'new'}>
          <Field label="帳號" required>
            <Input name="account" defaultValue={editing?.帳號} readOnly={!!editing} required />
          </Field>
          <Field label="名稱（顯示為操作者）">
            <Input name="displayName" defaultValue={editing?.名稱} />
          </Field>
          <Field label={editing ? '新密碼（留白不變更）' : '密碼'} required={!editing}>
            <Input name="password" type="password" autoComplete="new-password" />
          </Field>
          <Field label="角色">
            <Select name="role" defaultValue={editing?.角色 ?? Role.Staff}>
              {Object.values(Role).map((r) => (
                <option key={r} value={r}>
                  {roleLabel[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="可管理活動" hint="活動ID，以逗號分隔；* 表示全部">
            <Input name="events" defaultValue={editing?.可管理活動} />
          </Field>
          <Field label="負責小隊（舊欄位）" hint="建議改到活動的「分組」頁指派負責人；此欄以名稱比對，可留白">
            <Input name="team" defaultValue={editing?.小隊} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={editing ? editing.啟用 !== 'N' : true} /> 啟用
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <SubmitButton>儲存</SubmitButton>
            {editing && (
              <a href={withBase('/accounts')} className="px-3 py-2 text-sm text-gray-600">
                取消
              </a>
            )}
          </div>
        </ActionForm>
      </Card>
      <Card title="帳號列表">
        <Table head={['帳號', '名稱', '角色', '可管理活動', '小隊', '狀態', '']}>
          {rows.map((r) => (
            <tr key={r.帳號}>
              <td className="px-2 py-2 font-mono text-xs">{r.帳號}</td>
              <td className="px-2 py-2">{r.名稱}</td>
              <td className="px-2 py-2">{roleLabel[r.角色] ?? r.角色}</td>
              <td className="px-2 py-2">{r.可管理活動}</td>
              <td className="px-2 py-2">{r.小隊}</td>
              <td className="px-2 py-2">{r.啟用 === 'N' ? <Badge tone="red">停用</Badge> : <Badge tone="green">啟用</Badge>}</td>
              <td className="space-x-1 whitespace-nowrap px-2 py-2 text-right">
                <a href={withBase(`/accounts?edit=${encodeURIComponent(r.帳號)}`)} className="text-purple-700 hover:underline">
                  編輯
                </a>
                <form action={deleteAccount.bind(null, r.帳號)} className="inline">
                  <Button variant="ghost" size="sm" className="text-red-600">
                    刪除
                  </Button>
                </form>
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
