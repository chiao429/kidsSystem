import Link from 'next/link';
import { Card, Empty, buttonClass } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { getEvent, loadTeams } from '@/lib/data';

export default async function TeamsPage({ params }: { params: { eventId: string } }) {
  const session = requireSession({ roles: ['admin', 'manager', 'staff'], eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const { mine, allowed } = await loadTeams(event.sheetId, session);
  const others = allowed.filter((t) => !mine.includes(t));
  const link = (t: string, primary: boolean) => (
    <Link key={t} href={`/e/${params.eventId}/t/${encodeURIComponent(t)}`} className={buttonClass(primary ? 'primary' : 'secondary', 'lg')}>
      {t}
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
      {mine.length > 0 && (
        <Card title="我的小隊">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{mine.map((t) => link(t, true))}</div>
        </Card>
      )}
      {others.length > 0 && (
        <Card title="其他小隊">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{others.map((t) => link(t, false))}</div>
        </Card>
      )}
      {allowed.length === 0 && (
        <Card>
          <Empty>沒有可點名的小隊。請管理員在帳號設定「負責小隊」，或在資料整理系統把你設為小隊長。</Empty>
        </Card>
      )}
    </>
  );
}
