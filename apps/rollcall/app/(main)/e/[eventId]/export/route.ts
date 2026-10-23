import { requireSession } from '@kids/auth/next';
import { getEvent, loadGroups } from '@/lib/data';
import { attendance, schedules } from '@/lib/tables';

export const dynamic = 'force-dynamic';

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function GET(_req: Request, { params }: { params: { eventId: string } }) {
  const session = requireSession({ permission: 'rollcall', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const { allowed, byId } = await loadGroups(event.活動ID, session, event.rules);
  const allowedIds = new Set(allowed.map((g) => g.分組ID));
  const [aa, ss] = await Promise.all([attendance(event.活動ID).all(), schedules(event.活動ID).all()]);
  const slotById = new Map(ss.map((s) => [s.時段ID, s]));
  const rows = aa
    .filter((a) => allowedIds.has(a.分組ID))
    .map((a) => {
      const s = slotById.get(a.時段ID);
      return [
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
    .sort((x, y) => (x[0] + x[1] + x[4]).localeCompare(y[0] + y[1] + y[4], 'zh-Hant', { numeric: true }));
  const header = ['日期', '時段', '內容', '分組類型', '分組', '姓名', '狀態', '備註', '點名者', '點名時間'];
  const csv = '﻿' + [header, ...rows].map((r) => r.map((v) => csvCell(String(v ?? ''))).join(',')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${event.名稱}_點名紀錄.csv`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
