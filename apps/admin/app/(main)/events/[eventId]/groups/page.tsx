import Link from 'next/link';
import { Alert, Badge, Card, Empty, Field, Input, Select, Table } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { GroupRole, GroupType, LEARNER_ROLES, RegistrationStatus, hasGroupType, type Group } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { addGroupLeader, removeGroupMember, saveGroup } from '@/lib/group-actions';
import { loadGroupState } from '@/lib/groups';
import { accounts, registrations } from '@/lib/tables';

export default async function GroupsPage({ params, searchParams }: { params: { eventId: string }; searchParams: { type?: string } }) {
  const event = await getEvent(params.eventId);
  const type = searchParams.type === GroupType.Team ? GroupType.Team : GroupType.Course;
  const [state, regs, accs] = await Promise.all([loadGroupState(event.活動ID), registrations(event.活動ID).all(), accounts().all()]);
  const active = new Set(regs.filter((r) => r.狀態 !== RegistrationStatus.Cancelled).map((r) => r.報名ID));
  const list = type === GroupType.Course ? state.courses : state.teams;
  const countOf = (g: Group) =>
    state.members.filter((m) => m.分組ID === g.分組ID && LEARNER_ROLES.includes(m.角色) && (!m.報名ID || active.has(m.報名ID))).length;
  const leadersOf = (g: Group) => state.members.filter((m) => m.分組ID === g.分組ID && !LEARNER_ROLES.includes(m.角色));
  const base = `/events/${params.eventId}/groups`;
  const isCourse = type === GroupType.Course;

  return (
    <>
      <div className="flex gap-2">
        {[GroupType.Course, GroupType.Team].map((t) => (
          <Link key={t} href={`${base}?type=${encodeURIComponent(t)}`} className={`rounded-full border px-3 py-1 text-sm ${t === type ? 'border-purple-600 bg-purple-600 text-white' : 'border-gray-300 bg-white'}`}>
            {t}
          </Link>
        ))}
      </div>
      {!hasGroupType(event.rules, type) && <Alert tone="amber">此活動尚未啟用「{type}」，可在「設定」勾選後，報名、報到與點名才會使用。</Alert>}
      {!isCourse && (
        <Alert tone="blue">
          新增小隊與分隊請到資料整理系統操作；這裡可修改名稱、區域與說明，或到「
          <Link href={`/events/${params.eventId}/teams`} className="underline">
            小隊
          </Link>
          」頁調整隊員。
        </Alert>
      )}

      <Card title={`${type}（${list.length}）`}>
        {list.length === 0 && <Empty>尚未建立{type}</Empty>}
        <div className="space-y-2">
          {[...list, ...(isCourse ? [null] : [])].map((g) => (
            <ActionForm key={g?.分組ID ?? `new-${list.length}`} action={saveGroup.bind(null, params.eventId, g?.分組ID ?? '', type)} className="grid items-end gap-2 border-b pb-2 sm:grid-cols-8">
              <Field label={g ? '名稱' : `新增${type}`}>
                <Input name="name" defaultValue={g?.名稱} />
              </Field>
              {isCourse ? (
                <>
                  <Field label="代碼" hint="跨活動比較用">
                    <Input name="code" defaultValue={g?.代碼} />
                  </Field>
                  <Field label="名額">
                    <Input name="capacity" type="number" min={0} defaultValue={g?.名額} />
                  </Field>
                </>
              ) : (
                <Field label="區域">
                  <Input name="area" defaultValue={g?.區域} />
                </Field>
              )}
              <Field label="說明">
                <Input name="note" defaultValue={g?.說明} />
              </Field>
              <Field label="排序">
                <Input name="order" type="number" defaultValue={g?.排序} />
              </Field>
              <Field label="狀態">
                <Select name="status" defaultValue={g?.狀態 || '啟用'}>
                  <option>啟用</option>
                  <option>停用</option>
                </Select>
              </Field>
              <div className="text-sm text-gray-600">
                {g && (
                  <>
                    {countOf(g)}
                    {g.名額 ? ` / ${g.名額}` : ''} 人
                    {g.名額 && countOf(g) >= Number(g.名額) && <Badge tone="red">額滿</Badge>}
                  </>
                )}
              </div>
              <SubmitButton size="sm">{g ? '儲存' : '新增'}</SubmitButton>
            </ActionForm>
          ))}
        </div>
      </Card>

      {list.length > 0 && (
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
      )}
    </>
  );
}
