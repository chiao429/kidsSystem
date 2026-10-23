import Link from 'next/link';
import { Card, Empty } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { listEvents } from '@/lib/events';

export default async function HomePage() {
  const session = requireSession({ permission: 'checkin' });
  const rows = (await listEvents(session)).filter((e) => e.狀態 !== '已結束');
  return (
    <Card title="選擇活動">
      {rows.length === 0 ? (
        <Empty>沒有可報到的活動</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((e) => (
            <li key={e.活動ID} className="flex items-center justify-between py-3">
              <span className="font-medium">{e.名稱}</span>
              <span className="flex gap-3 text-sm">
                <Link href={`/e/${e.活動ID}`} className="text-blue-700 underline">報到</Link>
                <Link href={`/e/${e.活動ID}/dashboard`} className="text-blue-700 underline">儀表板</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
