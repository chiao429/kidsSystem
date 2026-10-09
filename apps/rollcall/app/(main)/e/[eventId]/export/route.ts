import { requireSession } from '@kids/auth/next';
import { getEvent, loadTeams } from '@/lib/data';
import { attendance, schedules } from '@/lib/tables';

export const dynamic = 'force-dynamic';

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export async function GET(_req: Request, { params }: { params: { eventId: string } }) {
  const session = requireSession({ roles: ['admin', 'manager', 'staff'], eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const { allowed } = await loadTeams(event.sheetId, session);
  const [aa, ss] = await Promise.all([attendance(event.sheetId).all(), schedules(event.sheetId).all()]);
  const slotById = new Map(ss.map((s) => [s.時段ID, s]));
  const rows = aa
    .filter((a) => allowed.includes(a.小隊))
    .map((a) => {
      const s = slotById.get(a.時段ID);
      return [
        s?.日期 ?? a.時段ID.replace('DAY-', ''),
        s ? `${s.開始}-${s.結束}` : '整日',
        s?.內容 ?? '',
        a.小隊,
        a.姓名,
        a.狀態,
        a.備註,
        a.操作者,
        a.時間,
      ];
    })
    .sort((x, y) => (x[0] + x[1] + x[3]).localeCompare(y[0] + y[1] + y[3], 'zh-Hant', { numeric: true }));
  const header = ['日期', '時段', '內容', '小隊', '姓名', '狀態', '備註', '點名者', '點名時間'];
  const csv = '﻿' + [header, ...rows].map((r) => r.map((v) => csvCell(String(v ?? ''))).join(',')).join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`${event.名稱}_點名紀錄.csv`)}`,
      'Cache-Control': 'no-store',
    },
  });
}
