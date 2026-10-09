import Link from 'next/link';
import { Card, Empty, Stat, Table, buttonClass } from '@kids/ui';
import { AutoRefresh } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { getEvent, loadTeams } from '@/lib/data';
import { loadStats } from '@/lib/stats';

export default async function StatsPage({ params }: { params: { eventId: string } }) {
  const session = requireSession({ roles: ['admin', 'manager', 'staff'], eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const { allowed } = await loadTeams(event.sheetId, session);
  const { cols, teamRows, totals } = await loadStats(event.sheetId, allowed);
  return (
    <>
      <AutoRefresh intervalMs={20_000} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href={`/e/${params.eventId}`} className="text-sm text-gray-500">
            ← {event.名稱}
          </Link>
          <h1 className="text-2xl font-bold">出席統計</h1>
        </div>
        <a href={`/e/${params.eventId}/export`} className={buttonClass('secondary', 'sm')}>
          匯出點名紀錄（CSV）
        </a>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="已點名人次" value={totals.recorded} tone="blue" />
        <Stat label="出席（含遲到）" value={totals.present} tone="green" />
        <Stat label="出席率" value={`${Math.round(totals.rate * 100)}%`} tone="amber" />
      </div>
      <Card title="小隊 × 時段（出席 / 小隊人數）">
        {cols.length === 0 ? (
          <Empty>還沒有點名紀錄</Empty>
        ) : (
          <Table head={['小隊', '人數', ...cols.map((c) => c.label)]}>
            {teamRows.map((r) => (
              <tr key={r.team}>
                <td className="px-2 py-2 font-medium">
                  <Link href={`/e/${params.eventId}/t/${encodeURIComponent(r.team)}`} className="hover:underline">
                    {r.team}
                  </Link>
                </td>
                <td className="px-2 py-2 tabular-nums">{r.size}</td>
                {r.cells.map((c, i) => (
                  <td key={cols[i].時段ID} className="px-2 py-2 tabular-nums">
                    {c.recorded === 0 ? (
                      <span className="text-gray-300">未點</span>
                    ) : (
                      <span className={c.absent ? 'text-red-700' : 'text-emerald-700'}>
                        {c.present} / {r.size}
                        {c.absent > 0 && <span className="ml-1 text-xs">缺 {c.absent}</span>}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
