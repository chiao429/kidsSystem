import Link from 'next/link';
import { requireSession } from '@kids/auth/next';
import { getEvent } from '@/lib/events';

export default async function EventLayout({ children, params }: { children: React.ReactNode; params: { eventId: string } }) {
  requireSession({ permission: 'data-tools', eventId: params.eventId });
  const event = await getEvent(params.eventId);
  const base = `/e/${params.eventId}`;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{event.名稱}</h1>
      <nav className="flex flex-wrap gap-1 border-b border-gray-200 text-sm">
        <Link href={base} className="rounded-t-md px-3 py-2 hover:bg-gray-100">名單與分組</Link>
        <Link href={`${base}/teams`} className="rounded-t-md px-3 py-2 hover:bg-gray-100">分隊</Link>
      </nav>
      {children}
    </div>
  );
}
