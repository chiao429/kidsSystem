import { requireSession } from '@kids/auth/next';
import { BASES } from '@kids/schema';
import { getEvent, loadGroups, testScope } from '@/lib/data';
import { attendance, schedules } from '@/lib/tables';

export const dynamic = 'force-dynamic';

const baseIndex = (b: string) => BASES.findIndex((x) => x.short === b);

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function GET(_req: Request, { params }: { params: { eventId: string } }) {
  const session = requireSession({ permission: 'rollcall', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const { allowed, byId } = await loadGroups(event.活動ID, session, event.rules);
  const allowedIds = new Set(allowed.map((g) => g.分組ID));
  const [allAttendance, ss, test] = await Promise.all([attendance(event.活動ID).all(), schedules(event.活動ID).all(), testScope(event.活動ID)]);
  // 匯出不含測試家庭
  const aa = allAttendance.filter((a) => !test.memberIds.has(a.成員ID));
  const slotById = new Map(ss.map((s) => [s.時段ID, s]));
  const rows = aa
    .filter((a) => allowedIds.has(a.分組ID))
    .map((a) => {
      const s = slotById.get(a.時段ID);
      return [
        byId.get(a.分組ID)?.基地 ?? '',
        s?.日期 ?? a.時段ID.replace('DAY-', ''),
        s ? `${s.開始}-${s.結束}` : '整日',
        s?.內容 ?? '',
        byId.get(a.分組ID)?.類型 ?? '',
        byId.get(a.分組ID)?.名稱 ?? a.分組ID,
        a.姓名,
        a.狀態,
        a.備註,
        a.操作者,
        a.時間,
      ];
    })
    // 依基地分開排序（思麥特在前），再依日期、時段、分組
    .sort(
      (x, y) =>
        baseIndex(String(x[0])) - baseIndex(String(y[0])) ||
        (x[1] + x[2] + x[5]).localeCompare(y[1] + y[2] + y[5], 'zh-Hant', { numeric: true }),
    );
  const header = ['基地', '日期', '時段', '內容', '分組類型', '分組', '姓名', '狀態', '備註', '點名者', '點名時間'];
  const csv = '﻿' + [header, ...rows].map((r) => r.map((v) => csvCell(String(v ?? ''))).join(',')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${event.名稱}_點名紀錄.csv`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
