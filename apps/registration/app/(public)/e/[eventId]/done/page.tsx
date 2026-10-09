import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { Badge, Card } from '@kids/ui';
import { RegistrationSource } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { registrations } from '@/lib/tables';

const tone = { 正取: 'green', 備取: 'amber', 待審核: 'blue', 取消: 'gray' } as const;

export default async function DonePage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { ids?: string; source?: string };
}) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  const ids = (searchParams.ids ?? '').split(',').filter(Boolean).slice(0, 20);
  const all = await registrations(event.sheetId).all({ fresh: true });
  const rows = ids.map((id) => all.find((r) => r.報名ID === id)).filter((r) => !!r);
  const qrs = await Promise.all(rows.map((r) => QRCode.toDataURL(r.報名ID, { margin: 1, width: 240 })));
  const checkinUrl = process.env.NEXT_PUBLIC_CHECKIN_URL;

  return (
    <>
      <Card title="報名完成">
        <p className="text-sm text-gray-700">
          請截圖保存以下 QR Code，活動當天出示即可快速報到。
          {rows.some((r) => r.狀態 !== '正取') && ' 備取或待審核者，主辦單位將另行通知。'}
        </p>
      </Card>
      {rows.map((r, i) => (
        <Card key={r.報名ID}>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrs[i]} alt={`${r.姓名} 報到 QR Code`} className="h-48 w-48" />
            <div className="space-y-1">
              <div className="text-2xl font-bold">{r.姓名}</div>
              <div className="text-gray-600">
                {event.名稱}｜序號 {r.序號}
              </div>
              <div className="text-gray-600">{r.年級}</div>
              {r.課程 && <div className="text-gray-600">課程：{r.課程}</div>}
              <Badge tone={tone[r.狀態 as keyof typeof tone] ?? 'gray'}>{r.狀態}</Badge>
              <div className="font-mono text-xs text-gray-400">{r.報名ID}</div>
            </div>
          </div>
        </Card>
      ))}
      {searchParams.source === RegistrationSource.OnSite && checkinUrl && (
        <a href={`${checkinUrl}/e/${event.活動ID}`} className="block text-center text-green-700 underline">
          回到報到系統
        </a>
      )}
    </>
  );
}
