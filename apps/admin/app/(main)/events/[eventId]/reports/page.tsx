import { Card, Stat, Table } from '@kids/ui';
import { getEvent } from '@/lib/events';
import { DATASETS, summary } from '@/lib/reports';

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function Breakdown({ title, rows }: { title: string; rows: readonly (readonly [string, number])[] }) {
  return (
    <Card title={title}>
      <Table head={['', '人數']}>
        {rows.map(([k, n]) => (
          <tr key={k}>
            <td className="px-2 py-1.5">{k}</td>
            <td className="px-2 py-1.5 tabular-nums">{n}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

export default async function ReportsPage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  const s = await summary(event.活動ID);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="正取" value={s.checkin.accepted} tone="blue" sub={`總報名 ${s.total}`} />
        <Stat label="已報到" value={s.checkin.arrived} tone="green" sub={pct(s.checkin.arrived, s.checkin.accepted)} />
        <Stat label="不會出席／晚到" value={`${s.checkin.absent}／${s.checkin.late}`} />
        <Stat label="點名出席率" value={pct(s.attendance.present, s.attendance.recorded)} tone="amber" sub={`${s.attendance.recorded} 人次`} />
      </div>

      {/* 依基地分開：思麥特（國小）、夢夢（學齡前） */}
      <div className="grid gap-4 md:grid-cols-2">
        {s.byBase.map((b) => (
          <Card key={b.short} title={`${b.name}（${b.note}）`}>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <Stat label="正取" value={b.accepted} tone="blue" />
              <Stat label="已報到" value={b.arrived} tone="green" sub={pct(b.arrived, b.accepted)} />
            </div>
            {b.courses.length > 0 && (
              <Table head={['課程', '人數']}>
                {b.courses.map(([name, n]) => (
                  <tr key={name}>
                    <td className="px-2 py-1.5">{name}</td>
                    <td className="px-2 py-1.5 tabular-nums">{n}</td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="年級分組（正取）">
          <Table head={['組別', '人數', '已報到', '報到率']}>
            {s.byGroup.map(([g, n, a]) => (
              <tr key={g}>
                <td className="px-2 py-1.5">{g}</td>
                <td className="px-2 py-1.5 tabular-nums">{n}</td>
                <td className="px-2 py-1.5 tabular-nums">{a}</td>
                <td className="px-2 py-1.5 tabular-nums">{pct(a, n)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Breakdown title="報名狀態" rows={s.byStatus} />
        <Breakdown title="報名類型" rows={s.byType} />
        <Breakdown title="報名來源" rows={s.bySource} />

      </div>

      <Card title="匯出報表">
        <div className="grid gap-4 md:grid-cols-2">
          {Object.entries(DATASETS).map(([key, d]) => (
            <form key={key} method="GET" action={`/events/${params.eventId}/reports/export`} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <input type="hidden" name="dataset" value={key} />
              <div className="font-medium">{d.label}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                {d.columns.map((c) => (
                  <label key={c} className="flex items-center gap-1">
                    <input type="checkbox" name="col" value={c} defaultChecked /> {c}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3 text-sm">
                <select name="format" className="rounded border border-gray-300 px-2 py-1">
                  <option value="csv">CSV</option>
                </select>
                <button className="rounded-full bg-[#315bc7] px-3 py-1.5 text-white shadow-sm">下載</button>
              </div>
            </form>
          ))}
        </div>
      </Card>
    </>
  );
}
