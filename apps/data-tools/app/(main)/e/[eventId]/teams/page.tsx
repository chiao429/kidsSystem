import { Card, Empty, Field, Input, Select } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { AutoSubmitSelect } from '@/components/AutoSubmitSelect';
import { getEvent } from '@/lib/events';
import { groupByGrade, loadRoster, type Kid } from '@/lib/roster';
import { teams } from '@/lib/tables';
import { addLeader, autoDivide, moveMember, removeTeamRow } from '@/lib/team-actions';

export default async function TeamsPage({ params }: { params: { eventId: string } }) {
  const eventId = params.eventId;
  const event = await getEvent(eventId);
  const [kids, rows] = await Promise.all([loadRoster(event.sheetId), teams(event.sheetId).all()]);
  const groups = groupByGrade(kids);
  const kidById = new Map(kids.map((k) => [k.成員ID, k]));
  const teamNames = Array.from(new Set(rows.map((r) => r.小隊))).sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
  const unassigned = kids.filter((k) => !k.小隊);

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
        <AutoSubmitSelect name="team" value={k.小隊} options={teamNames} />
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

      {teamNames.length === 0 ? (
        <Card>
          <Empty>尚未分隊</Empty>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {teamNames.map((name) => {
            const teamRows = rows.filter((r) => r.小隊 === name);
            const leaders = teamRows.filter((r) => r.角色 !== '隊員');
            const members = teamRows.filter((r) => r.角色 === '隊員').map((r) => kidById.get(r.成員ID)).filter((k): k is Kid => !!k);
            return (
              <Card
                key={name}
                title={
                  <span>
                    {name} <span className="text-sm font-normal text-gray-500">{teamRows[0]?.區域}</span>
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
                      <li key={l.小隊成員ID} className="flex justify-between">
                        <span>
                          <span className="text-gray-500">{l.角色}</span> {l.姓名}
                        </span>
                        <form action={removeTeamRow.bind(null, eventId, l.小隊成員ID)}>
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

      {unassigned.length > 0 && teamNames.length > 0 && (
        <Card title={`未分隊（${unassigned.length}）`}>
          <ul className="grid gap-x-6 text-sm sm:grid-cols-2">{unassigned.map(memberRow)}</ul>
        </Card>
      )}

      {teamNames.length > 0 && (
        <Card title="加入小隊長 / 副小隊長">
          <ActionForm action={addLeader.bind(null, eventId)} className="grid gap-3 sm:grid-cols-5">
            <Field label="小隊" required>
              <Select name="team">
                {teamNames.map((t) => (
                  <option key={t}>{t}</option>
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
    </>
  );
}
