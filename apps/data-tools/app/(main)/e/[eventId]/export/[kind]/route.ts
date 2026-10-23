import { requireSession } from '@kids/auth/next';
import { GroupRole, GroupType, RegistrationStatus, groupsOfType } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { workbookResponse } from '@/lib/excel';
import { groupByGrade, loadRoster, siblingText, type Kid } from '@/lib/roster';
import { groupMembers, groups } from '@/lib/tables';

export const dynamic = 'force-dynamic';

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }).replace(/-/g, '');

export async function GET(req: Request, { params }: { params: { eventId: string; kind: string } }) {
  requireSession({ permission: 'data-tools', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const all = new URL(req.url).searchParams.get('all');
  const statuses = all ? Object.values(RegistrationStatus).filter((s) => s !== '取消') : undefined;
  const kids = await loadRoster(event.活動ID, { statuses });

  if (params.kind === 'grades') {
    // 總表：依序號排序，手足展開成多列
    const head = ['項次', '序號', '姓名', '性別', '年級', '學校', '家長', '電話', '小隊', '手足姓名', '手足稱謂', '手足年級', '手足小隊', '特殊需求'];
    const summary: (string | number)[][] = [head];
    for (const k of kids) {
      const base = [k.序號, k.姓名, k.性別, k.年級, k.學校, k.家長, k.電話, k.小隊];
      const sibs = k.siblings.length ? k.siblings : [null];
      for (const s of sibs) {
        summary.push([summary.length, ...base, s?.姓名 ?? '', s?.稱謂 ?? '', s?.年級 ?? '', s?.小隊 ?? '', k.特殊需求]);
      }
    }
    const gradeHead = ['項次', '序號', '姓名', '性別', '年級', '學校', '家長', '電話', '小隊', '手足', '特殊需求'];
    const gradeSheets = groupByGrade(kids).map((g) => ({
      name: g.group,
      rows: [
        gradeHead,
        ...g.kids.map((k, i) => [i + 1, k.序號, k.姓名, k.性別, k.年級, k.學校, k.家長, k.電話, k.小隊, siblingText(k), k.特殊需求]),
      ],
    }));
    const stats = [
      ['組別', '男', '女', '合計'],
      ...groupByGrade(kids).map((g) => [
        g.group,
        g.kids.filter((k) => k.性別 === '男').length,
        g.kids.filter((k) => k.性別 === '女').length,
        g.kids.length,
      ]),
      ['合計', kids.filter((k) => k.性別 === '男').length, kids.filter((k) => k.性別 === '女').length, kids.length],
    ];
    return workbookResponse(
      [{ name: '總表', rows: summary }, ...gradeSheets, { name: '統計', rows: stats }],
      `${event.名稱}_分組_${today()}.xlsx`,
    );
  }

  const [gg, gm] = await Promise.all([groups(event.活動ID).all(), groupMembers(event.活動ID).all()]);
  const teamGroups = groupsOfType(gg, GroupType.Team);
  const teamNames = teamGroups.map((g) => g.名稱);
  const groupByName = new Map(teamGroups.map((g) => [g.名稱, g]));
  const teamRows = gm.filter((r) => r.類型 === GroupType.Team);
  const rowsOf = (team: string) => teamRows.filter((r) => r.分組ID === groupByName.get(team)?.分組ID);
  const kidById = new Map(kids.map((k) => [k.成員ID, k]));
  const membersOf = (team: string): Kid[] =>
    rowsOf(team)
      .filter((r) => r.角色 === GroupRole.Member)
      .map((r) => kidById.get(r.成員ID))
      .filter((k): k is Kid => !!k)
      .sort((a, b) => (Number(a.序號) || 0) - (Number(b.序號) || 0));

  if (params.kind === 'teams') {
    const overview = [
      ['小隊', '區域', '小隊長', '副小隊長', '人數', '男', '女'],
      ...teamNames.map((t) => {
        const leaders = rowsOf(t);
        const ms = membersOf(t);
        return [
          t,
          groupByName.get(t)?.區域 ?? '',
          leaders.filter((r) => r.角色 === '小隊長').map((r) => r.姓名).join('、'),
          leaders.filter((r) => r.角色 === '副小隊長').map((r) => r.姓名).join('、'),
          ms.length,
          ms.filter((k) => k.性別 === '男').length,
          ms.filter((k) => k.性別 === '女').length,
        ];
      }),
    ];
    const perTeam = teamNames.map((t) => ({
      name: t,
      rows: [
        ['項次', '序號', '姓名', '性別', '年級', '學校', '家長', '電話', '手足', '課程', '特殊需求', '出席'],
        ...membersOf(t).map((k, i) => [i + 1, k.序號, k.姓名, k.性別, k.年級, k.學校, k.家長, k.電話, siblingText(k), k.課程, k.特殊需求, '']),
      ],
    }));
    return workbookResponse([{ name: '小隊總覽', rows: overview }, ...perTeam], `${event.名稱}_小隊名單_${today()}.xlsx`);
  }

  if (params.kind === 'notify') {
    const rows: (string | number)[][] = [['小隊', '序號', '姓名', '性別', '年級', '家長', '電話', '手足（含小隊）', '課程', '特殊需求', '已通知']];
    for (const t of teamNames) for (const k of membersOf(t)) rows.push([t, k.序號, k.姓名, k.性別, k.年級, k.家長, k.電話, siblingText(k), k.課程, k.特殊需求, '']);
    for (const k of kids.filter((x) => !x.小隊)) rows.push(['（未分隊）', k.序號, k.姓名, k.性別, k.年級, k.家長, k.電話, siblingText(k), k.課程, k.特殊需求, '']);
    return workbookResponse([{ name: '行前通知', rows }], `${event.名稱}_行前通知_${today()}.xlsx`);
  }

  return new Response('Not found', { status: 404 });
}
