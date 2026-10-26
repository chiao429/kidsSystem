import Link from 'next/link';
import { Card, Empty } from '@kids/ui';
import { listOpenEvents, registrationWindow } from '@/lib/events';

/** 「2026-10-26T14:52」→「2026-10-26 14:52」 */
const dt = (v: string) => v.replace('T', ' ');

/** 報名期間：開放 ~ 截止；沒設開放時間為「即日起」，兩者都沒設時不顯示 */
function registrationPeriod(e: { 報名開放: string; 報名截止: string }) {
  if (!e.報名開放 && !e.報名截止) return '';
  return `${e.報名開放 ? dt(e.報名開放) : '即日起'}${e.報名截止 ? ` ~ ${dt(e.報名截止)}` : ''}`;
}

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
                  <Link href={`/e/${e.活動ID}`} className="flex items-center justify-between py-3 hover:text-[#ff54bb]">
                    <div>
                      <div className="font-medium">{e.名稱}</div>
                      {registrationPeriod(e) && <div className="text-sm text-gray-500">報名期間：{registrationPeriod(e)}</div>}
                    </div>
                    <span className="text-sm text-gray-500">{w.open ? '報名 →' : w.reason}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <p className="text-center text-sm">
        <Link href="/qr" className="rb-link">
          已經報名了？用手機＋PIN 查詢報到 QR code
        </Link>
      </p>
    </>
  );
}
