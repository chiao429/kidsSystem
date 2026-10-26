import QRCode from 'qrcode';
import Link from 'next/link';
import { Badge, Card, Empty } from '@kids/ui';
import { CheckInStatus, EventStatus, GroupType, ENROLLED_ROLES, courseLabel, isArchivedEvent } from '@kids/schema';
import { verifiedFamilyId } from '@kids/registration-core/lib/family-auth';
import { isActive } from '@kids/registration-core/lib/eligibility';
import { checkIns, events, groupMembers, groups, households, registrations } from '@kids/registration-core/lib/tables';
import { MyQrLogin, MyQrSignOut } from '@/components/MyQrLogin';

export const dynamic = 'force-dynamic';

const tone = { 正取: 'green', 備取: 'amber', 待審核: 'blue', 取消: 'gray' } as const;

/**
 * 首頁「已經報名了？」：家長以手機＋PIN 登入後，列出此家庭在各活動的報到 QR code
 * （每場活動一個 QR code，全家共用；已結束與封存的活動不列出）。
 */
export default async function MyQrPage() {
  const familyId = verifiedFamilyId();
  const family = familyId ? (await households().all()).find((h) => h.家庭ID === familyId) : undefined;
  if (!family) {
    return (
      <>
        <Link href="/" className="rb-back">
          <span aria-hidden>←</span> 回首頁
        </Link>
        <h1 className="text-xl font-bold">查詢報到 QR code</h1>
        <MyQrLogin />
      </>
    );
  }

  // 已結束的活動也列出（放進歷史紀錄）
  const list = (await events().all()).filter((e) => !isArchivedEvent(e));
  const found = (
    await Promise.all(
      list.map(async (e) => {
        const rows = (await registrations(e.活動ID).all().catch(() => []))
          .filter((r) => isActive(r) && r.家庭ID === family.家庭ID)
          .sort((a, b) => (Number(a.序號) || 0) - (Number(b.序號) || 0));
        if (rows.length === 0) return null;
        const [gg, gm, cc] = await Promise.all([groups(e.活動ID).all(), groupMembers(e.活動ID).all(), checkIns(e.活動ID).all().catch(() => [])]);
        // 一般報到（分組ID 空白）的狀態
        const checkInOf = (報名ID: string) => cc.find((c) => c.報名ID === 報名ID && !c.分組ID);
        const courseNames = (報名ID: string) =>
          gm
            .filter((m) => m.報名ID === 報名ID && m.類型 === GroupType.Course && ENROLLED_ROLES.includes(m.角色))
            .map((m) => { const n = gg.find((g) => g.分組ID === m.分組ID)?.名稱; return n ? courseLabel(n, m.角色) : ''; })
            .filter(Boolean)
            .join('、');
        const withStatus = rows.map((r) => {
          const c = checkInOf(r.報名ID);
          return { ...r, 課程: courseNames(r.報名ID), 報到: c?.狀態 ?? '', 報到時間: c?.狀態 === CheckInStatus.Arrived ? c.報到時間 : '' };
        });
        // 每位孩子都已報到（或已表示不會出席），或活動已結束 → 歷史紀錄
        const done = e.狀態 === EventStatus.Ended || withStatus.every((r) => r.報到 === CheckInStatus.Arrived || r.報到 === CheckInStatus.Absent);
        return {
          event: e,
          rows: withStatus,
          done,
          qr: done ? '' : await QRCode.toDataURL(family.家庭ID, { margin: 1, width: 280 }),
        };
      }),
    )
  ).filter((x): x is NonNullable<typeof x> => !!x);
  const current = found.filter((f) => !f.done);
  // 歷史紀錄：新的活動在前
  const history = found.filter((f) => f.done).sort((a, b) => b.event.開始日期.localeCompare(a.event.開始日期));

  return (
    <>
      <Link href="/" className="rb-back">
        <span aria-hidden>←</span> 回首頁
      </Link>
      <Card title="報到 QR Code">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-700">{family.主要聯絡人} 的家庭。請截圖保存，活動當天出示即可快速報到。</p>
          <MyQrSignOut />
        </div>
      </Card>
      {current.length === 0 ? (
        <Card>
          <Empty>目前沒有待報到的活動。</Empty>
        </Card>
      ) : (
        current.map(({ event, rows, qr }) => (
          <Card key={event.活動ID} title={event.名稱}>
            <div className="flex flex-col items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`${event.名稱} 報到 QR Code`} className="h-56 w-56" />
              <p className="text-center text-sm text-gray-600">
                {dateText(event)}｜全家共用一個 QR Code
                {rows.length > 1 && `，掃描一次 ${rows.length} 位一起報到`}
              </p>
              <KidRows rows={rows} />
            </div>
          </Card>
        ))
      )}
      {/* 歷史紀錄：已報到完成或已結束的活動，不再顯示 QR code */}
      {history.length > 0 && (
        <Card title={`歷史紀錄（${history.length}）`}>
          <div className="space-y-4">
            {history.map(({ event, rows }) => (
              <div key={event.活動ID} className="space-y-2">
                <div>
                  <div className="font-bold text-gray-900">{event.名稱}</div>
                  <div className="text-xs text-gray-500">{dateText(event)}</div>
                </div>
                <KidRows rows={rows} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

const dateText = (e: { 開始日期: string; 結束日期: string }) => `${e.開始日期}${e.結束日期 && e.結束日期 !== e.開始日期 ? ` ~ ${e.結束日期}` : ''}`;

/** 孩子列表：序號、年級、課程、報名狀態；已報到的顯示報到時間 */
function KidRows({ rows }: { rows: { 報名ID: string; 姓名: string; 序號: string; 年級: string; 課程: string; 狀態: string; 報到: string; 報到時間: string }[] }) {
  return (
    <div className="w-full divide-y rounded-lg border">
      {rows.map((r) => (
        <div key={r.報名ID} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="text-lg font-bold">{r.姓名}</span>
          <span className="text-sm text-gray-500">序號 {r.序號}・{r.年級}</span>
          {r.課程 && <span className="text-sm text-gray-600">課程：{r.課程}</span>}
          <span className="ml-auto flex gap-1">
            {r.報到 === CheckInStatus.Arrived && <Badge tone="green">已報到 {r.報到時間.split(' ')[1]?.slice(0, 5)}</Badge>}
            {r.報到 === CheckInStatus.Absent && <Badge tone="gray">不會出席</Badge>}
            <Badge tone={tone[r.狀態 as keyof typeof tone] ?? 'gray'}>{r.狀態}</Badge>
          </span>
        </div>
      ))}
    </div>
  );
}
