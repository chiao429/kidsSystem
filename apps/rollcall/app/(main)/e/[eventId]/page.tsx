import Link from 'next/link';
import { Card, Empty, buttonClass } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { getEvent, loadGroups, type GroupRef } from '@/lib/data';

export default async function TeamsPage({ params }: { params: { eventId: string } }) {
  const session = requireSession({ permission: 'rollcall', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const { mine, allowed } = await loadGroups(event.活動ID, session, event.rules);
  const others = allowed.filter((g) => !mine.some((m) => m.分組ID === g.分組ID));
  const types = Array.from(new Set(allowed.map((g) => g.類型)));
  const link = (g: GroupRef, primary: boolean) => (
    <Link key={g.分組ID} href={`/e/${params.eventId}/t/${encodeURIComponent(g.分組ID)}`} className={buttonClass(primary ? 'primary' : 'secondary', 'lg')}>
      {g.名稱}
    </Link>
  );
  return (
    <>
      <div className="flex items-end justify-between">
        <h1 className="text-2xl font-bold">{event.名稱}</h1>
        <Link href={`/e/${params.eventId}/stats`} className="text-amber-700 underline">
          出席統計
        </Link>
      </div>
      {types.map((type) => {
        const myList = mine.filter((g) => g.類型 === type);
        const otherList = others.filter((g) => g.類型 === type);
        return (
          <div key={type} className="space-y-4">
            {myList.length > 0 && (
              <Card title={`我的${type}`}>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{myList.map((g) => link(g, true))}</div>
              </Card>
            )}
            {otherList.length > 0 && (
              <Card title={`其他${type}`}>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{otherList.map((g) => link(g, false))}</div>
              </Card>
            )}
          </div>
        );
      })}
      {allowed.length === 0 && (
        <Card>
        <Empty>沒有可點名的分組。請管理員在後台「分組」指派你為老師，或在資料整理系統把你設為小隊長。</Empty>
        </Card>
      )}
    </>
  );
}
