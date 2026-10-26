import { Badge, Card, Field, Input, Select } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { BASES } from '@kids/schema';
import { deleteGroup, saveGroup } from '@/lib/actions';
import { DeleteButton } from '@/components/DeleteButton';
import { listGroups, type SmallGroup } from '@/lib/data';
import { SheetImport } from '@/components/SheetImport';
import { accounts, smallGroupMembers } from '@/lib/tables';

/** 小組設定（設定檔）：小組名稱、基地、排序、負責人、啟用／停用 */
export default async function SettingsPage() {
  requireSession({ permission: 'smallgroup-settings' });
  const [groups, accs, mm] = await Promise.all([listGroups(), accounts().all(), smallGroupMembers().all()]);
  const memberCount = (id: string) => mm.filter((m) => m.小組ID === id && !m.離開日期).length;
  const people = accs.filter((a) => a.啟用 !== 'N').map((a) => ({ id: a.帳號, name: a.名稱 || a.帳號 }));
  return (
    <>
      <h1 className="text-2xl font-bold">小組設定</h1>
      <SheetImport kind="groups" />
      <p className="text-sm text-gray-600">負責人可以點名自己的小組；角色範圍不是「只限自己負責」的帳號可以點所有小組。停用的小組不會出現在點名列表，紀錄都會保留。</p>
      {[...groups, null].map((g) => (
        <Card
          key={g?.小組ID ?? 'new'}
          title={g ? <span>{g.名稱} {g.狀態 === '停用' && <Badge tone="gray">停用</Badge>}</span> : '新增小組'}
          actions={
            g && (
              <DeleteButton
                title={`刪除「${g.名稱}」？`}
                description={`會直接刪除這個小組，以及它的組員名單（目前 ${memberCount(g.小組ID)} 位）、所有點名紀錄與線上聚會人數，無法復原；孩子本身的資料不受影響。只是暫時不用的話，可以把狀態改成「停用」。`}
                action={deleteGroup.bind(null, g.小組ID)}
              />
            )
          }
        >
          <GroupForm group={g} people={people} />
        </Card>
      ))}
    </>
  );
}

function GroupForm({ group, people }: { group: SmallGroup | null; people: { id: string; name: string }[] }) {
  const leaders = new Set((group?.負責人 ?? '').split(',').filter(Boolean));
  return (
    <ActionForm action={saveGroup.bind(null, group?.小組ID ?? '')} className="grid gap-3 sm:grid-cols-4">
      <Field label="名稱" required>
        <Input name="name" defaultValue={group?.名稱} required />
      </Field>
      <Field label="基地" required>
        <Select name="base" defaultValue={group?.基地 ?? BASES[0].short}>
          {BASES.map((b) => (
            <option key={b.short} value={b.short}>
              {b.short}（{b.note}）
            </option>
          ))}
        </Select>
      </Field>
      <Field label="排序">
        <Input name="order" type="number" defaultValue={group?.排序 ?? '0'} />
      </Field>
      <Field label="狀態">
        <Select name="status" defaultValue={group?.狀態 || '啟用'}>
          <option>啟用</option>
          <option>停用</option>
        </Select>
      </Field>
      <div className="sm:col-span-4">
        <Field label="說明">
          <Input name="note" defaultValue={group?.說明} />
        </Field>
      </div>
      <div className="sm:col-span-4">
        <div className="mb-1 text-sm font-medium text-gray-700">負責人</div>
        {people.length === 0 ? (
          <p className="text-sm text-gray-500">還沒有帳號，請先在後台「帳號」建立。</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {people.map((p) => (
              <label key={p.id} className="flex items-center gap-1.5">
                <input type="checkbox" name="leaders" value={p.id} defaultChecked={leaders.has(p.id)} /> {p.name}
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="sm:col-span-4">
        <SubmitButton size="sm">{group ? '儲存' : '新增小組'}</SubmitButton>
      </div>
    </ActionForm>
  );
}
