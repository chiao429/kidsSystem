import Link from 'next/link';
import { requireSession } from '@kids/auth/next';
import { Alert } from '@kids/ui';
import { RollCall } from '@/components/RollCall';
import { getEvent, loadRoll, loadSlots, loadTeams, today } from '@/lib/data';

export default async function RollCallPage({
  params,
  searchParams,
}: {
  params: { eventId: string; team: string };
  searchParams: { slot?: string };
}) {
  const session = requireSession({ roles: ['admin', 'manager', 'staff'], eventId: params.eventId });
  const team = decodeURIComponent(params.team);
  const event = await getEvent(params.eventId);
  if (!(await loadTeams(event.sheetId, session)).allowed.includes(team)) {
    return <Alert>沒有「{team}」的點名權限</Alert>;
  }
  const slots = await loadSlots(event.sheetId, team);

  // 預設：今天目前進行中的時段 → 今天最近的時段 → 最後一個
  const nowHM = new Date(Date.now() + 8 * 3600_000).toISOString().slice(11, 16);
  const todays = slots.filter((s) => s.日期 === today());
  const current =
    todays.find((s) => s.時間.includes('-') && s.時間.split('-')[0] <= nowHM && nowHM < s.時間.split('-')[1]) ??
    todays.find((s) => s.時間.split('-')[0] > nowHM) ??
    todays[todays.length - 1] ??
    slots[slots.length - 1];
  const slot = slots.find((s) => s.時段ID === searchParams.slot) ?? current;
  const roll = await loadRoll(event.sheetId, team, slot.時段ID);
  const base = `/e/${params.eventId}/t/${encodeURIComponent(team)}`;

  return (
    <>
      <div>
        <Link href={`/e/${params.eventId}`} className="text-sm text-gray-500">
          ← {event.名稱}
        </Link>
        <h1 className="text-2xl font-bold">{team} 點名</h1>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {slots.map((s) => (
          <Link
            key={s.時段ID}
            href={`${base}?slot=${s.時段ID}`}
            className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${s.時段ID === slot.時段ID ? 'border-amber-600 bg-amber-50 font-semibold text-amber-800' : 'border-gray-300 bg-white'}`}
          >
            <div>
              {s.日期.slice(5)} {s.時間}
            </div>
            <div className="text-xs text-gray-500">{s.地點 || s.內容}</div>
          </Link>
        ))}
      </div>
      <RollCall key={slot.時段ID} eventId={params.eventId} team={team} slotId={slot.時段ID} initial={roll} />
    </>
  );
}
