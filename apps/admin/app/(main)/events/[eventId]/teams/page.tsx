import { Alert, Card, Empty, Input, Select, Table } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { GroupRole, GroupType, LEARNER_ROLES, RegistrationStatus, hasGroupType, type Group } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { removeGroupMember, updateTeamMember } from '@/lib/group-actions';
import { loadGroupState } from '@/lib/groups';
import { accounts, registrations } from '@/lib/tables';
import { GroupLeaders, TeamSettings } from '@/components/GroupLeaders';

/** 小隊分頁（與課程完全分開）：小隊設定、小隊長、隊員調整 */
export default async function TeamsPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  const [state, regs, accs] = await Promise.all([loadGroupState(event.活動ID), registrations(event.活動ID).all(), accounts().all()]);
  const teams = state.teams;
  const active = new Set(regs.filter((r) => r.狀態 !== RegistrationStatus.Cancelled).map((r) => r.報名ID));
  const countOf = (g: Group) =>
    state.members.filter((m) => m.分組ID === g.分組ID && LEARNER_ROLES.includes(m.角色) && (!m.報名ID || active.has(m.報名ID))).length;
  const leadersOf = (g: Group) => state.members.filter((m) => m.分組ID === g.分組ID && !LEARNER_ROLES.includes(m.角色));
  const notice = (
    <>
      {!hasGroupType(event.rules, GroupType.Team) && <Alert tone="amber">此活動尚未啟用「小隊」，到「設定」→「進階設定」的「使用的分組」勾選後，報名、報到與點名才會使用。</Alert>}
      <Alert tone="blue">
        新增小隊與自動分隊請到{' '}
        <a href={`/data-tools/e/${params.eventId}`} className="underline">
          分組分隊
        </a>{' '}
        系統；這裡可以修改小隊設定、指派小隊長與調整隊員。
      </Alert>
    </>
  );
  if (teams.length === 0) {
    return (
      <>
        {notice}
        <Card>
          <Empty>尚未建立小隊（由分組分隊系統分隊後即可在此調整）</Empty>
        </Card>
      </>
    );
  }
  return (
    <>
    {notice}
    <TeamSettings eventId={params.eventId} list={teams} countOf={countOf} />
    <GroupLeaders eventId={params.eventId} type={GroupType.Team} list={teams} leadersOf={leadersOf} accs={accs} />
    <h2 className="text-lg font-bold">隊員</h2>
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
    </>
  );
}
