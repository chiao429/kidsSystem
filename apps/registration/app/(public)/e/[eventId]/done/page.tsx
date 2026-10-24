import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { Badge, Card } from '@kids/ui';
import { GroupType, LEARNER_ROLES, RegistrationSource } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { groupMembers, groups, registrations } from '@/lib/tables';

const tone = { 正取: 'green', 備取: 'amber', 待審核: 'blue', 取消: 'gray' } as const;

export default async function DonePage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { ids?: string; source?: string; view?: string };
}) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  const ids = (searchParams.ids ?? '').split(',').filter(Boolean).slice(0, 20);
  const all = await registrations(event.活動ID).all({ fresh: true });
  // 一個家庭一個 QR Code（內容為家庭ID），列出此家庭在本活動所有有效報名
  const familyIds = Array.from(new Set(ids.map((id) => all.find((r) => r.報名ID === id)?.家庭ID).filter((x): x is string => !!x)));
  const families = familyIds.map((家庭ID) => ({
    家庭ID,
    rows: all.filter((r) => r.家庭ID === 家庭ID && r.狀態 !== '取消').sort((a, b) => (Number(a.序號) || 0) - (Number(b.序號) || 0)),
  }));
  const rows = families.flatMap((f) => f.rows);
  const [gg, gm] = await Promise.all([groups(event.活動ID).all(), groupMembers(event.活動ID).all({ fresh: true })]);
  const courseNames = (報名ID: string) =>
    gm
      .filter((m) => m.報名ID === 報名ID && m.類型 === GroupType.Course && LEARNER_ROLES.includes(m.角色))
      .map((m) => gg.find((g) => g.分組ID === m.分組ID)?.名稱 ?? '')
      .filter(Boolean)
      .join('、');
  const qrs = await Promise.all(families.map((f) => QRCode.toDataURL(f.家庭ID, { margin: 1, width: 280 })));
  const checkinUrl = process.env.NEXT_PUBLIC_CHECKIN_URL?.replace(/\/+$/, '');

  return (
    <>
      <Card title={searchParams.view === 'qr' ? '報到 QR Code' : '報名完成'}>
        <p className="text-sm text-gray-700">
          請截圖保存以下 QR Code，活動當天出示即可快速報到。
          {rows.some((r) => r.狀態 !== '正取') && ' 備取或待審核者，主辦單位將另行通知。'}
        </p>
      </Card>
      {families.map((f, i) => (
        <Card key={f.家庭ID}>
          <div className="flex flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrs[i]} alt="家庭報到 QR Code" className="h-56 w-56" />
            <p className="text-center text-sm text-gray-600">
              {event.名稱}｜全家共用一個 QR Code{f.rows.length > 1 && `，掃描一次 ${f.rows.length} 位一起報到`}
            </p>
            <div className="w-full divide-y rounded-lg border">
              {f.rows.map((r) => (
                <div key={r.報名ID} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className="text-lg font-bold">{r.姓名}</span>
                  <span className="text-sm text-gray-500">序號 {r.序號}・{r.年級}</span>
                  {courseNames(r.報名ID) && <span className="text-sm text-gray-600">課程：{courseNames(r.報名ID)}</span>}
                  <span className="ml-auto">
                    <Badge tone={tone[r.狀態 as keyof typeof tone] ?? 'gray'}>{r.狀態}</Badge>
                  </span>
                </div>
              ))}
            </div>
            <div className="font-mono text-xs text-gray-400">{f.家庭ID}</div>
          </div>
        </Card>
      ))}
      {searchParams.source === RegistrationSource.OnSite && checkinUrl && (
        <a href={`${checkinUrl}/e/${event.活動ID}`} className="block text-center text-[#315bc7] underline">
          回到報到系統
        </a>
      )}
    </>
  );
}
