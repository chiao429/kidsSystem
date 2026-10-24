import Link from 'next/link';
import { requireSession } from '@kids/auth/next';
import { GroupType, hasGroupType, isArchivedEvent } from '@kids/schema';
import { Alert, Badge } from '@kids/ui';
import { getEvent } from '@/lib/events';

const tabClass = 'rounded-t-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100';

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: { eventId: string } }) {
  requireSession({ permission: 'admin', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const base = `/events/${params.eventId}`;
  const tabs = [
    ['', '設定'],
    ['/description', '活動說明'],
    ['/groups', '課程'],
    ['/registrations', '報名'],
    ['/logs', '日誌'],
  ];
  // 較少用到的功能收進「更多」；小隊相關分頁只在啟用小隊時出現
  const more = [
    ...(hasGroupType(event.rules, GroupType.Team) ? [['/teams', '小隊'], ['/schedule', '時間表']] : []),
    ['/surveys', '問卷'],
    ['/reports', '報表'],
  ];
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-gray-500">{event.活動ID}</div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold">
          {event.名稱}
          {isArchivedEvent(event) && <Badge tone="gray">已封存</Badge>}
        </h1>
        {event.sheetId && event.活動試算表.startsWith('http') && (
          <a href={event.活動試算表} target="_blank" rel="noreferrer" className="text-sm text-[#315bc7] underline">
            開啟活動試算表
          </a>
        )}
      </div>
      {isArchivedEvent(event) && <Alert tone="amber">此活動已封存，家長端與報到、點名系統都看不到。要恢復請到活動清單的「已封存」按「還原」。</Alert>}
      <nav className="flex flex-wrap items-center gap-1 border-b border-gray-200">
        {tabs.map(([path, label]) => (
          <Link key={path} href={base + path} className={tabClass}>
            {label}
          </Link>
        ))}
        <details className="relative">
          <summary className={`${tabClass} cursor-pointer list-none`}>更多 ▾</summary>
          <div className="absolute left-0 z-20 mt-1 min-w-32 rounded-xl border border-gray-200 bg-white p-1 shadow-lg">
            {more.map(([path, label]) => (
              <Link key={path} href={base + path} className="block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                {label}
              </Link>
            ))}
          </div>
        </details>
      </nav>
      {children}
    </div>
  );
}
