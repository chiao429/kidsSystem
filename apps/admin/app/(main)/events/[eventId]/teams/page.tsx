import { Card, Empty, Input, Select, Table } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { GroupRole } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { removeGroupMember, updateTeamMember } from '@/lib/group-actions';
import { loadGroupState } from '@/lib/groups';

export default async function TeamsPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  const state = await loadGroupState(event.活動ID);
  const teams = state.teams;
  if (teams.length === 0) {
    return (
      <Card>
        <Empty>尚未建立小隊（由資料整理系統分隊後即可在此調整）</Empty>
      </Card>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {teams.map((t) => {
        const rows = state.members.filter((m) => m.分組ID === t.分組ID);
        return (
          <Card key={t.分組ID} title={`${t.名稱}（${rows.filter((m) => m.角色 === GroupRole.Member).length} 人）`} actions={<span className="text-sm text-gray-500">{t.區域}</span>}>
            <Table head={['姓名', '小隊', '角色', '']}>
              {rows.map((m) => {
                const formId = `tm-${m.分組成員ID}`;
                return (
                  <tr key={m.分組成員ID}>
                    <td className="px-2 py-1">{m.姓名 || m.成員ID}</td>
                    <td className="px-2 py-1">
                      <Select form={formId} name="team" defaultValue={m.分組ID} className="text-xs">
                        {teams.map((x) => (
                          <option key={x.分組ID} value={x.分組ID}>
                            {x.名稱}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-2 py-1">
                      <Input form={formId} name="role" defaultValue={m.角色} className="w-24 text-xs" list="team-roles" />
                    </td>
                    <td className="whitespace-nowrap px-2 py-1">
                      <form id={formId} action={updateTeamMember.bind(null, params.eventId, m.分組成員ID)} className="inline">
                        <SubmitButton size="sm" variant="secondary">
                          儲存
                        </SubmitButton>
                      </form>
                      <form action={removeGroupMember.bind(null, params.eventId, m.分組成員ID)} className="inline">
                        <button className="ml-1 text-xs text-red-600">移除</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </Card>
        );
      })}
      <datalist id="team-roles">
        {[GroupRole.Member, GroupRole.Leader, '副小隊長', GroupRole.Assistant].map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  );
}
