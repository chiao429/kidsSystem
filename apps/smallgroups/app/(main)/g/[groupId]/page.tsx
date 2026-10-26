import Link from 'next/link';
import { requireSession } from '@kids/auth/next';
import { RollSheet } from '@/components/RollSheet';
import { attendanceOn, checkedInOn, getGroup, isDate, kidDirectory, rosterOn, today } from '@/lib/data';
import { smallGroupMembers } from '@/lib/tables';

const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);

/** 小組點名：選日期（預設今天），當天有報到的組員自動點名出席；今天有報到、還沒有小組的孩子可加入 */
export default async function GroupRollPage({ params, searchParams }: { params: { groupId: string }; searchParams: { date?: string } }) {
  const session = requireSession({ permission: 'smallgroups' });
  const group = await getGroup(session, params.groupId);
  const date = isDate(searchParams.date) ? searchParams.date! : today();
  const [roster, records, arrived, kids, allMembers] = await Promise.all([
    rosterOn(group.小組ID, date),
    attendanceOn(group.小組ID, date),
    checkedInOn(date),
    kidDirectory(),
    smallGroupMembers().all({ fresh: true }),
  ]);
  const arrivedIds = new Set(arrived.map((k) => k.成員ID));
  const recordOf = new Map(records.map((r) => [r.成員ID, r]));
  const rows = roster
    .map((m) => {
      const k = kids.get(m.成員ID);
      const r = recordOf.get(m.成員ID);
      return {
        成員ID: m.成員ID,
        姓名: k?.姓名 || m.姓名,
        年級: k?.年級 ?? '',
        特殊需求: k?.特殊需求 ?? '',
        狀態: r?.狀態 ?? '',
        當天狀況: r?.當天狀況 ?? '',
        備註: r?.備註 ?? '',
        操作者: r?.操作者 ?? '',
        報到: arrivedIds.has(m.成員ID),
      };
    })
    .sort((a, b) => a.姓名.localeCompare(b.姓名, 'zh-Hant'));
  // 當天有報到、目前不在任何小組、而且屬於這個基地的孩子（多半是現場報名）
  const inAnyGroup = new Set(allMembers.filter((m) => !m.離開日期).map((m) => m.成員ID));
  const candidates = arrived.filter((k) => !inAnyGroup.has(k.成員ID) && k.基地 === group.基地).sort((a, b) => Number(b.現場報名) - Number(a.現場報名));
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/" className="text-sm text-gray-500">
            ← 小組點名
          </Link>
          <h1 className="text-2xl font-bold">
            {group.名稱}
            <span className="ml-2 text-base font-normal text-gray-500">{group.基地}</span>
          </h1>
        </div>
        <Link href={`/g/${group.小組ID}/members`} className="text-sm text-[#0f9d77] underline">
          管理組員
        </Link>
      </div>
      <RollSheet key={date} groupId={group.小組ID} date={date} prev={shift(date, -7)} next={shift(date, 7)} isToday={date === today()} rows={rows} candidates={candidates} />
    </>
  );
}
