import QRCode from 'qrcode';
import { notFound } from 'next/navigation';
import { Badge, Card } from '@kids/ui';
import { GroupType, ENROLLED_ROLES, RegistrationSource, courseLabel } from '@kids/schema';
import { getEvent } from '@kids/registration-core/lib/events';
import { groupMembers, groups, households, members, registrations } from '@kids/registration-core/lib/tables';
import { isStaff, verifiedFamilyId } from '@kids/registration-core/lib/family-auth';
import { BackLink } from '@/components/BackLink';

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
      .filter((m) => m.報名ID === 報名ID && m.類型 === GroupType.Course && ENROLLED_ROLES.includes(m.角色))
      .map((m) => { const n = gg.find((g) => g.分組ID === m.分組ID)?.名稱; return n ? courseLabel(n, m.角色) : ''; })
      .filter(Boolean)
      .join('、');
  const qrs = await Promise.all(families.map((f) => QRCode.toDataURL(f.家庭ID, { margin: 1, width: 280 })));
  const checkinUrl = process.env.NEXT_PUBLIC_CHECKIN_URL?.replace(/\/+$/, '');
  // 報名資料（個資）只給以 PIN 驗證過的本家庭或同工看；其他人只看得到 QR code
  const viewer = verifiedFamilyId();
  const canSeeDetails = (家庭ID: string) => viewer === 家庭ID || isStaff();
  const [hh, mm] = families.some((f) => canSeeDetails(f.家庭ID)) ? await Promise.all([households().all(), members().all()]) : [[], []];

  return (
    <>
      <BackLink eventId={params.eventId} />
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
      {families.filter((f) => canSeeDetails(f.家庭ID)).map((f) => {
        const h = hh.find((x) => x.家庭ID === f.家庭ID);
        const row = (label: string, value?: string) => (
          <div className="grid grid-cols-[6.5rem_1fr] gap-2 py-1.5 text-sm">
            <dt className="text-gray-500">{label}</dt>
            <dd className="font-semibold">{value || '—'}</dd>
          </div>
        );
        return (
          <Card key={`detail-${f.家庭ID}`} title="報名資料">
            <p className="mb-3 text-xs text-gray-500">以下為報名時填寫的資料，僅供確認；如需修改請聯絡主辦單位。</p>
            <dl className="divide-y">
              {row('主要聯絡人', h?.主要聯絡人)}
              {row('手機號碼', h?.電話)}
              {row('Email', h?.Email)}
              {row('地址', h?.地址)}
            </dl>
            {f.rows.map((r) => {
              const m = mm.find((x) => x.成員ID === r.成員ID);
              return (
                <section key={r.報名ID} className="mt-4 rounded-2xl bg-gray-50 p-3">
                  <h3 className="mb-1 font-bold">
                    {r.姓名} <span className="text-sm font-normal text-gray-500">序號 {r.序號}</span>
                  </h3>
                  <dl className="divide-y divide-gray-200">
                    {row('性別', m?.性別)}
                    {row('生日', m?.生日)}
                    {row('年級', r.年級)}
                    {row('學校', m?.學校)}
                    {row('課程', courseNames(r.報名ID))}
                    {row('特殊需求', m?.特殊需求)}
                    {row('報名狀態', r.狀態)}
                    {row('照片影片公開', r.照片影片公開同意)}
                    {row('後續活動通知', r.後續活動通知同意)}
                  </dl>
                </section>
              );
            })}
          </Card>
        );
      })}
      {searchParams.source === RegistrationSource.OnSite && checkinUrl && (
        <a href={`${checkinUrl}/e/${event.活動ID}`} className="rb-link block text-center">
          回到報到系統
        </a>
      )}
    </>
  );
}
