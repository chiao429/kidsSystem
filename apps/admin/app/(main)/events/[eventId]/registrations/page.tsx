import { revalidatePath } from 'next/cache';
import { Badge, Card, Empty, Input, Select, Stat, Table } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { RegistrationStatus, gradeRank } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { writeLog } from '@/lib/log';
import { registrations } from '@/lib/tables';

async function updateStatus(eventId: string, formData: FormData) {
  'use server';
  const session = requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  const ids = formData.getAll('ids').map(String);
  const 狀態 = String(formData.get('status'));
  if (ids.length === 0 || !(Object.values(RegistrationStatus) as string[]).includes(狀態)) return;
  await registrations(event.sheetId).updateByIds(ids.map((id) => ({ id, changes: { 狀態 } })));
  await writeLog(event.sheetId, session, `報名狀態改為${狀態}`, ids.join(','));
  revalidatePath(`/events/${eventId}/registrations`);
}

const tone = { 正取: 'green', 備取: 'amber', 待審核: 'blue', 取消: 'gray' } as const;

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { q?: string; status?: string };
}) {
  const event = await getEvent(params.eventId);
  const all = await registrations(event.sheetId).all();
  const q = (searchParams.q ?? '').trim();
  const rows = all
    .filter((r) => !searchParams.status || r.狀態 === searchParams.status)
    .filter((r) => !q || [r.姓名, r.報名ID, r.家庭ID, r.課程].some((v) => v.includes(q)))
    .sort((a, b) => gradeRank(a.年級) - gradeRank(b.年級) || a.報名時間.localeCompare(b.報名時間));
  const count = (s: string) => all.filter((r) => r.狀態 === s).length;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="正取" value={count('正取')} tone="green" />
        <Stat label="備取" value={count('備取')} tone="amber" />
        <Stat label="待審核" value={count('待審核')} tone="blue" />
        <Stat label="取消" value={count('取消')} />
      </div>
      <Card title={`報名名單（${rows.length}）`}>
        <form className="mb-3 flex flex-wrap gap-2">
          <Input name="q" placeholder="搜尋姓名、報名ID、課程" defaultValue={q} className="max-w-xs" />
          <Select name="status" defaultValue={searchParams.status ?? ''} className="max-w-[10rem]">
            <option value="">全部狀態</option>
            {Object.values(RegistrationStatus).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
          <button className="rounded-lg border px-3 text-sm">篩選</button>
        </form>
        {rows.length === 0 ? (
          <Empty>沒有符合的報名資料</Empty>
        ) : (
          <form action={updateStatus.bind(null, params.eventId)} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              勾選的報名改為
              <Select name="status" className="max-w-[8rem]">
                {Object.values(RegistrationStatus).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </Select>
              <SubmitButton size="sm">套用</SubmitButton>
            </div>
            <Table head={['', '姓名', '年級', '類型', '課程', '狀態', '來源', '報名時間', '報名ID']}>
              {rows.map((r) => (
                <tr key={r.報名ID}>
                  <td className="px-2 py-2">
                    <input type="checkbox" name="ids" value={r.報名ID} />
                  </td>
                  <td className="px-2 py-2 font-medium">{r.姓名}</td>
                  <td className="px-2 py-2">{r.年級}</td>
                  <td className="px-2 py-2">{r.報名類型}</td>
                  <td className="px-2 py-2">{r.課程}</td>
                  <td className="px-2 py-2">
                    <Badge tone={tone[r.狀態 as keyof typeof tone] ?? 'gray'}>{r.狀態}</Badge>
                  </td>
                  <td className="px-2 py-2">{r.來源}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-gray-500">{r.報名時間}</td>
                  <td className="px-2 py-2 font-mono text-xs text-gray-500">{r.報名ID}</td>
                </tr>
              ))}
            </Table>
          </form>
        )}
      </Card>
    </>
  );
}
