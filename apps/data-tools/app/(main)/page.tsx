import Link from 'next/link';
import { Card, Empty } from '@kids/ui';
import { requireSession } from '@kids/auth/next';
import { listEvents } from '@/lib/events';

export default async function HomePage() {
  const session = requireSession({ roles: ['admin', 'manager'] });
  const rows = await listEvents(session);
  return (
    <Card title="選擇活動">
      {rows.length === 0 ? (
        <Empty>沒有可管理的活動</Empty>
      ) : (
        <ul className="divide-y">
          {rows.map((e) => (
            <li key={e.活動ID}>
              <Link href={`/e/${e.活動ID}`} className="flex justify-between py-3 hover:text-teal-700">
                <span className="font-medium">{e.名稱}</span>
                <span className="text-sm text-gray-500">{e.開始日期}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
