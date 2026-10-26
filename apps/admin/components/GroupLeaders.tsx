import { Badge, Card, Empty, Field, Input, Select, Table } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { GroupRole, GroupType, type Group, type GroupMember } from '@kids/schema';
import { addGroupLeader, removeGroupMember, saveGroup } from '@/lib/group-actions';

interface Account {
  帳號: string;
  名稱: string;
  啟用: string;
}

/** 課程或小隊的負責人（老師、助理／小隊長、副小隊長）：指派與移除 */
export function GroupLeaders({ eventId, type, list, leadersOf, accs }: { eventId: string; type: GroupType; list: Group[]; leadersOf: (g: Group) => GroupMember[]; accs: Account[] }) {
  const isCourse = type === GroupType.Course;
  const params = { eventId };
  if (list.length === 0) return null;
  return (
    <Card title="負責人">
          <ActionForm action={addGroupLeader.bind(null, params.eventId)} className="mb-3 grid items-end gap-2 sm:grid-cols-4">
            <Field label={type} required>
              <Select name="group">
                {list.map((g) => (
                  <option key={g.分組ID} value={g.分組ID}>
                    {g.名稱}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="帳號" required>
              <Select name="account">
                {accs
                  .filter((a) => a.啟用 !== 'N')
                  .map((a) => (
                    <option key={a.帳號} value={a.帳號}>
                      {a.名稱 || a.帳號}（{a.帳號}）
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="角色">
              <Select name="role">
                {(isCourse ? [GroupRole.Teacher, GroupRole.Assistant] : [GroupRole.Leader, '副小隊長', GroupRole.Assistant]).map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </Select>
            </Field>
            <SubmitButton>指派</SubmitButton>
          </ActionForm>
          <Table head={[type, '角色', '姓名', '帳號', '']}>
            {list.flatMap((g) =>
              leadersOf(g).map((m) => (
                <tr key={m.分組成員ID}>
                  <td className="px-2 py-1.5">{g.名稱}</td>
                  <td className="px-2 py-1.5">{m.角色}</td>
                  <td className="px-2 py-1.5">{m.姓名}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{m.成員ID}</td>
                  <td className="px-2 py-1.5">
                    <form action={removeGroupMember.bind(null, params.eventId, m.分組成員ID)}>
                      <button className="text-xs text-red-600">移除</button>
                    </form>
                  </td>
                </tr>
              )),
            )}
          </Table>
        </Card>
  );
}

/** 小隊設定：名稱、區域、說明、排序、狀態與人數 */
export function TeamSettings({ eventId, list, countOf }: { eventId: string; list: Group[]; countOf: (g: Group) => number }) {
  const type = GroupType.Team;
  const params = { eventId };
  return (
        <Card title={`${type}（${list.length}）`}>
          {list.length === 0 && <Empty>尚未建立{type}</Empty>}
          <div className="space-y-2">
            {list.map((g) => (
              <ActionForm key={g.分組ID} action={saveGroup.bind(null, params.eventId, g.分組ID, type)} className="grid items-end gap-2 border-b pb-2 sm:grid-cols-8">
                <Field label="名稱">
                  <Input name="name" defaultValue={g.名稱} />
                </Field>
                <Field label="區域">
                  <Input name="area" defaultValue={g.區域} />
                </Field>
                <Field label="說明">
                  <Input name="note" defaultValue={g.說明} />
                </Field>
                <Field label="排序">
                  <Input name="order" type="number" defaultValue={g.排序} />
                </Field>
                <Field label="狀態">
                  <Select name="status" defaultValue={g.狀態 || '啟用'}>
                    <option>啟用</option>
                    <option>停用</option>
                  </Select>
                </Field>
                <div className="text-sm text-gray-600">
                  {countOf(g)}
                  {g.名額 ? ` / ${g.名額}` : ''} 人
                  {g.名額 && countOf(g) >= Number(g.名額) && <Badge tone="red">額滿</Badge>}
                </div>
                <SubmitButton size="sm">儲存</SubmitButton>
              </ActionForm>
            ))}
          </div>
        </Card>
  );
}
