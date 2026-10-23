import Link from 'next/link';
import { requireSession } from '@kids/auth/next';
import { getEvent } from '@/lib/events';

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: { eventId: string } }) {
  requireSession({ roles: ['admin', 'manager'], eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const base = `/events/${params.eventId}`;
  const tabs = [
    ['', '設定'],
    ['/registrations', '報名'],
    ['/groups', '分組'],
    ['/teams', '小隊'],
    ['/schedule', '時間表'],
    ['/surveys', '問卷'],
    ['/reports', '報表'],
    ['/logs', '日誌'],
  ];
  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm text-gray-500">{event.活動ID}</div>
        <h1 className="text-2xl font-bold">{event.名稱}</h1>
        <a href={event.活動試算表} target="_blank" rel="noreferrer" className="text-sm text-purple-700 underline">
          開啟活動試算表
        </a>
      </div>
      <nav className="flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map(([path, label]) => (
          <Link key={path} href={base + path} className="rounded-t-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
