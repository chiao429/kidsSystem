import Link from 'next/link';
import { Card, Empty } from '@kids/ui';
import { listOpenEvents, registrationWindow } from '@/lib/events';

export default async function HomePage() {
  const events = await listOpenEvents();
  return (
    <>
      <Card title="開放報名中的活動">
        {events.length === 0 ? (
          <Empty>目前沒有開放報名的活動</Empty>
        ) : (
          <ul className="divide-y">
            {events.map((e) => {
              const w = registrationWindow(e);
              return (
                <li key={e.活動ID}>
                  <Link href={`/e/${e.活動ID}`} className="flex items-center justify-between py-3 hover:text-[#315bc7]">
                    <div>
                      <div className="font-medium">{e.名稱}</div>
                      <div className="text-sm text-gray-500">
                        {e.開始日期}
                        {e.結束日期 && e.結束日期 !== e.開始日期 && ` ~ ${e.結束日期}`}
                      </div>
                    </div>
                    <span className="text-sm text-gray-500">{w.open ? '報名 →' : w.reason}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-center text-xs">
        <a href="/staff" className="text-gray-400 hover:underline">
          同工入口
        </a>
      </p>
    </>
  );
}
