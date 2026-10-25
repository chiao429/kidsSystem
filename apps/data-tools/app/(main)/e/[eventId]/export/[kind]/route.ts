import { requireSession } from '@kids/auth/next';
import { BASES, GroupRole, GroupType, RegistrationStatus, groupBaseOf, groupsOfType } from '@kids/schema';
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
    // 總表：依基地分開（思麥特在前），基地內依序號排序，手足展開成多列
    const head = ['項次', '基地', '序號', '姓名', '性別', '年級', '學校', '家長', '電話', '小隊', '手足姓名', '手足稱謂', '手足年級', '手足小隊', '特殊需求'];
    const summary: (string | number)[][] = [head];
    const byBase = BASES.flatMap((b) => kids.filter((k) => k.基地 === b.short));
    for (const k of byBase) {
      const base = [k.基地, k.序號, k.姓名, k.性別, k.年級, k.學校, k.家長, k.電話, k.小隊];
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
    // 統計：各基地的年級分組＋基地小計，最後是總計
    const count = (list: Kid[]) => [list.filter((k) => k.性別 === '男').length, list.filter((k) => k.性別 === '女').length, list.length];
    const stats: (string | number)[][] = [['基地', '組別', '男', '女', '合計']];
    for (const b of BASES) {
      const list = kids.filter((k) => k.基地 === b.short);
      if (list.length === 0) continue;
      for (const g of groupByGrade(list)) stats.push([b.short, g.group, ...count(g.kids)]);
      stats.push([b.short, '小計', ...count(list)]);
    }
    stats.push(['合計', '', ...count(kids)]);
    return workbookResponse(
      [{ name: '總表', rows: summary }, ...gradeSheets, { name: '統計', rows: stats }],
      `${event.名稱}_分組_${today()}.xlsx`,
    );
  }

  const [gg, gm] = await Promise.all([groups(event.活動ID).all(), groupMembers(event.活動ID).all()]);
  const kidByIdForBase = new Map(kids.map((k) => [k.成員ID, k]));
  // 小隊依成員年級歸屬基地，思麥特在前
  const baseOfTeam = new Map(
    groupsOfType(gg, GroupType.Team).map((g) => [
      g.名稱,
      groupBaseOf(g, gm.filter((m) => m.分組ID === g.分組ID && m.角色 === GroupRole.Member).map((m) => kidByIdForBase.get(m.成員ID)?.年級 ?? '').filter(Boolean)),
    ]),
  );
  const baseIdx = (name: string) => BASES.findIndex((b) => b.short === baseOfTeam.get(name));
  const teamGroups = groupsOfType(gg, GroupType.Team).sort((a, b) => baseIdx(a.名稱) - baseIdx(b.名稱));
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
      ['基地', '小隊', '區域', '小隊長', '副小隊長', '人數', '男', '女'],
      ...teamNames.map((t) => {
        const leaders = rowsOf(t);
        const ms = membersOf(t);
        return [
          baseOfTeam.get(t) ?? '',
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
      name: `${baseOfTeam.get(t) ?? ''}-${t}`,
      rows: [
        ['項次', '序號', '姓名', '性別', '年級', '學校', '家長', '電話', '手足', '課程', '特殊需求', '出席'],
        ...membersOf(t).map((k, i) => [i + 1, k.序號, k.姓名, k.性別, k.年級, k.學校, k.家長, k.電話, siblingText(k), k.課程, k.特殊需求, '']),
      ],
    }));
    return workbookResponse([{ name: '小隊總覽', rows: overview }, ...perTeam], `${event.名稱}_小隊名單_${today()}.xlsx`);
  }

  if (params.kind === 'notify') {
    // 行前通知：思麥特、夢夢各一張工作表（依孩子年級分）
    const head = ['小隊', '序號', '姓名', '性別', '年級', '家長', '電話', '手足（含小隊）', '課程', '特殊需求', '已通知'];
    const sheets = BASES.map((b) => {
      const rows: (string | number)[][] = [head];
      for (const t of teamNames) for (const k of membersOf(t).filter((x) => x.基地 === b.short)) rows.push([t, k.序號, k.姓名, k.性別, k.年級, k.家長, k.電話, siblingText(k), k.課程, k.特殊需求, '']);
      for (const k of kids.filter((x) => !x.小隊 && x.基地 === b.short)) rows.push(['（未分隊）', k.序號, k.姓名, k.性別, k.年級, k.家長, k.電話, siblingText(k), k.課程, k.特殊需求, '']);
      return { name: `行前通知-${b.short}`, rows };
    }).filter((s) => s.rows.length > 1);
    return workbookResponse(sheets.length ? sheets : [{ name: '行前通知', rows: [head] }], `${event.名稱}_行前通知_${today()}.xlsx`);
  }

  return new Response('Not found', { status: 404 });
}
