import Link from 'next/link';
import { requireSession } from '@kids/auth/next';
import { getEvent } from '@/lib/events';
import { sheetFeaturesVisible } from '@kids/sheets-core';

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: { eventId: string } }) {
  requireSession({ permission: 'checkin', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  // Google Sheet 同步暫停（或不需要試算表）時不顯示試算表連結
  const showSheet = await sheetFeaturesVisible();
  const base = `/e/${params.eventId}`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold">{event.名稱}</h1>
        <nav className="flex gap-1 text-sm">
          <Link href={base} className="rounded-md px-3 py-1.5 hover:bg-gray-100">報到</Link>
          <Link href={`${base}/dashboard`} className="rounded-md px-3 py-1.5 hover:bg-gray-100">儀表板</Link>
          {showSheet && event.活動試算表.startsWith('http') && (
            <a href={event.活動試算表} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 hover:bg-gray-100">
              試算表
            </a>
          )}
        </nav>
      </div>
      {children}
    </div>
  );
}
