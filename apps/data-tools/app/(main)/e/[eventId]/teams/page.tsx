import { Card, Empty, Field, Input, Select } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { AutoSubmitSelect } from '@/components/AutoSubmitSelect';
import { getEvent } from '@/lib/events';
import { groupByGrade, loadRoster, type Kid } from '@/lib/roster';
import { GroupRole, GroupType, groupsOfType, hasGroupType } from '@kids/schema';
import { groupMembers, groups as groupTable } from '@/lib/tables';
import { addLeader, autoDivide, moveMember, removeTeamRow, saveTeam } from '@/lib/team-actions';

export default async function TeamsPage({ params }: { params: { eventId: string } }) {
  const eventId = params.eventId;
  const event = await getEvent(eventId);
  if (!hasGroupType(event.rules, GroupType.Team)) {
    return <Card><p className="text-sm text-gray-600">此活動未啟用小隊，不需要建立小隊。</p></Card>;
  }
  const [kids, gg, gm] = await Promise.all([loadRoster(event.活動ID), groupTable(event.活動ID).all(), groupMembers(event.活動ID).all()]);
  const groups = groupByGrade(kids);
  const kidById = new Map(kids.map((k) => [k.成員ID, k]));
  const teamList = groupsOfType(gg, GroupType.Team, true);
  const activeTeams = teamList.filter((g) => g.狀態 !== '停用');
  const rows = gm.filter((r) => r.類型 === GroupType.Team);
  const options = activeTeams.map((g) => ({ value: g.分組ID, label: g.名稱 }));
  const unassigned = kids.filter((k) => !k.小隊ID);

  const memberRow = (k: Kid) => (
    <li key={k.成員ID} className="flex items-center justify-between gap-2 py-1">
      <span>
        <span className={k.性別 === '男' ? 'text-blue-700' : 'text-pink-700'}>{k.姓名}</span>
        <span className="ml-1 text-xs text-gray-500">
          {k.年級}
          {k.siblings.length > 0 && ` ・手足 ${k.siblings.map((s) => s.姓名).join('、')}`}
        </span>
      </span>
      <form action={moveMember.bind(null, eventId, k.成員ID, k.姓名)}>
        <AutoSubmitSelect name="team" value={k.小隊ID} options={options} />
      </form>
    </li>
  );

  return (
    <>
      <Card title="自動分隊">
        <ActionForm action={autoDivide.bind(null, eventId)} className="grid gap-3 sm:grid-cols-4">
          <Field label="組別" required>
            <Select name="group">
              {groups.map((g) => (
                <option key={g.group} value={g.group}>
                  {g.group}（{g.kids.length} 人）
                </option>
              ))}
            </Select>
          </Field>
          <Field label="隊數" required>
            <Input type="number" name="teamCount" min={1} defaultValue={4} />
          </Field>
          <Field label="小隊名稱" hint="例如「一年級-」→ 一年級-01；或用 {n}：S1{n}" required>
            <Input name="pattern" defaultValue="第{n}隊" />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input type="checkbox" name="keepSiblings" /> 同組別手足分同隊
          </label>
          <p className="text-xs text-gray-500 sm:col-span-4">
            會重新分配此組別所有隊員（小隊長不受影響），盡量平均人數、性別與學校。分完後可在下方逐一調整。
          </p>
          <div className="sm:col-span-4">
            <SubmitButton>分隊</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      {activeTeams.length === 0 ? (
        <Card>
          <Empty>尚未分隊</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {activeTeams.map((team) => {
            const teamRows = rows.filter((r) => r.分組ID === team.分組ID);
            const leaders = teamRows.filter((r) => r.角色 !== GroupRole.Member);
            const members = teamRows.filter((r) => r.角色 === GroupRole.Member).map((r) => kidById.get(r.成員ID)).filter((k): k is Kid => !!k);
            return (
              <Card
                key={team.分組ID}
                title={
                  <span>
                    {team.名稱} <span className="text-sm font-normal text-gray-500">{team.區域}</span>
                  </span>
                }
                actions={
                  <span className="text-sm text-gray-600">
                    {members.length} 人（男 {members.filter((k) => k.性別 === '男').length}・女 {members.filter((k) => k.性別 === '女').length}）
                  </span>
                }
              >
                {leaders.length > 0 && (
                  <ul className="mb-2 border-b pb-2 text-sm">
                    {leaders.map((l) => (
                      <li key={l.分組成員ID} className="flex justify-between">
                        <span>
                          <span className="text-gray-500">{l.角色}</span> {l.姓名}
                        </span>
                        <form action={removeTeamRow.bind(null, eventId, l.分組成員ID)}>
                          <button className="text-xs text-red-600">移除</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                )}
                <ul className="divide-y text-sm">{members.map(memberRow)}</ul>
              </Card>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && activeTeams.length > 0 && (
        <Card title={`未分隊（${unassigned.length}）`}>
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2">{unassigned.map(memberRow)}</ul>
        </Card>
      )}

      {activeTeams.length > 0 && (
        <Card title="加入小隊長 / 副小隊長">
          <ActionForm action={addLeader.bind(null, eventId)} className="grid gap-3 sm:grid-cols-5">
            <Field label="小隊" required>
              <Select name="team">
                {activeTeams.map((t) => (
                  <option key={t.分組ID} value={t.分組ID}>
                    {t.名稱}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="角色">
              <Select name="role">
                <option>小隊長</option>
                <option>副小隊長</option>
              </Select>
            </Field>
            <Field label="姓名" required>
              <Input name="name" />
            </Field>
            <Field label="帳號" hint="點名系統登入帳號，可留白">
              <Input name="account" />
            </Field>
            <div className="pt-6">
              <SubmitButton>加入</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}
      <Card title="小隊設定">
        <div className="space-y-2">
          {[...teamList, null].map((t) => (
            <ActionForm key={t?.分組ID ?? `new-${teamList.length}`} action={saveTeam.bind(null, eventId, t?.分組ID ?? '')} className="grid items-end gap-2 sm:grid-cols-7">
              <Field label={t ? '名稱' : '新增小隊'}>
                <Input name="name" defaultValue={t?.名稱} />
              </Field>
              <Field label="區域（組別）">
                <Input name="area" defaultValue={t?.區域} />
              </Field>
              <Field label="說明">
                <Input name="note" defaultValue={t?.說明} />
              </Field>
              <Field label="排序">
                <Input name="order" type="number" defaultValue={t?.排序} />
              </Field>
              <Field label="狀態">
                <Select name="status" defaultValue={t?.狀態 || '啟用'}>
                  <option>啟用</option>
                  <option>停用</option>
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton>{t ? '儲存' : '新增'}</SubmitButton>
              </div>
            </ActionForm>
          ))}
        </div>
      </Card>
    </>
  );
}
