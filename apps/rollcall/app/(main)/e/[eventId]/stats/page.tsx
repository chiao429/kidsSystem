import Link from 'next/link';
import { Card, Empty, Stat, Table, buttonClass, withBase } from '@kids/ui';
import { AutoRefresh } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { getEvent, loadGroups } from '@/lib/data';
import { loadStats } from '@/lib/stats';
import { BASES } from '@kids/schema';

export default async function StatsPage({ params }: { params: { eventId: string } }) {
  const session = requireSession({ permission: 'rollcall', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const { allowed } = await loadGroups(event.活動ID, session, event.rules);
  const { cols, teamRows, totals, byBase } = await loadStats(event.活動ID, allowed);
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
        <a href={withBase(`/e/${params.eventId}/export`)} className={buttonClass('secondary', 'sm')}>
          匯出點名紀錄（CSV）
        </a>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="已點名人次" value={totals.recorded} tone="blue" />
        <Stat label="出席（含遲到）" value={totals.present} tone="green" />
        <Stat label="出席率" value={`${Math.round(totals.rate * 100)}%`} tone="amber" />
      </div>
      {/* 依基地分開：思麥特（國小）、夢夢（學齡前） */}
      {BASES.map((b) => {
        const rows = teamRows.filter((r) => r.base === b.short);
        if (rows.length === 0) return null;
        const t = byBase[b.short];
        return (
          <Card
            key={b.short}
            title={`${b.name}（${b.note}）`}
            actions={
              <span className="text-sm text-gray-600 tabular-nums">
                出席 {t.present} / 點名 {t.recorded} 人次・{Math.round(t.rate * 100)}%
              </span>
            }
          >
            {cols.length === 0 ? (
              <Empty>還沒有點名紀錄</Empty>
            ) : (
              <Table head={['分組', '人數', ...cols.map((c) => c.label)]}>
                {rows.map((r) => (
                  <tr key={r.team}>
                    <td className="px-2 py-2 font-medium">
                      <Link href={`/e/${params.eventId}/t/${encodeURIComponent(r.team)}`} className="hover:underline">
                        {r.name}
                      </Link>
                      <span className="ml-1 text-xs text-gray-400">{r.type}</span>
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
        );
      })}
    </>
  );
}
