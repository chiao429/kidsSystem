import { revalidatePath } from 'next/cache';
import { Button, Card, Empty, Field, Input, Table } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { newId } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { writeLog } from '@/lib/log';
import { schedules, teams } from '@/lib/tables';

async function addSlot(eventId: string, formData: FormData) {
  'use server';
  const session = requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  const teamNames = formData.getAll('team').map(String).filter(Boolean);
  const base = { 日期: s('date'), 開始: s('start'), 結束: s('end'), 地點: s('location'), 內容: s('content') };
  // 勾選多個小隊時，每隊一列（地點可之後個別修改）
  const targets = teamNames.length > 0 ? teamNames : ['全部'];
  await schedules(event.sheetId).append(targets.map((小隊) => ({ 時段ID: newId('時段ID'), 小隊, ...base })));
  await writeLog(event.sheetId, session, '新增時段', '', `${base.日期} ${base.開始}-${base.結束} ${targets.join(',')}`);
  revalidatePath(`/events/${eventId}/schedule`);
}

async function updateSlot(eventId: string, id: string, formData: FormData) {
  'use server';
  requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  await schedules(event.sheetId).updateByIds([
    { id, changes: { 日期: s('date'), 開始: s('start'), 結束: s('end'), 地點: s('location'), 內容: s('content') } },
  ]);
  revalidatePath(`/events/${eventId}/schedule`);
}

async function deleteSlot(eventId: string, id: string) {
  'use server';
  const session = requireSession({ roles: ['admin', 'manager'], eventId });
  const event = await getEvent(eventId);
  await schedules(event.sheetId).deleteByIds([id]);
  await writeLog(event.sheetId, session, '刪除時段', id);
  revalidatePath(`/events/${eventId}/schedule`);
}

export default async function SchedulePage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  const [slots, members] = await Promise.all([schedules(event.sheetId).all(), teams(event.sheetId).all()]);
  const teamNames = Array.from(new Set(members.map((m) => m.小隊).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const sorted = [...slots].sort(
    (a, b) => a.日期.localeCompare(b.日期) || a.開始.localeCompare(b.開始) || a.小隊.localeCompare(b.小隊, 'zh-Hant'),
  );

  return (
    <>
      <Card title="新增時段">
        <form action={addSlot.bind(null, params.eventId)} className="grid gap-3 sm:grid-cols-5">
          <Field label="日期" required>
            <Input type="date" name="date" defaultValue={event.開始日期} required />
          </Field>
          <Field label="開始" required>
            <Input type="time" name="start" required />
          </Field>
          <Field label="結束" required>
            <Input type="time" name="end" required />
          </Field>
          <Field label="地點">
            <Input name="location" />
          </Field>
          <Field label="內容">
            <Input name="content" />
          </Field>
          <div className="sm:col-span-5">
            <div className="mb-1 text-sm font-medium text-gray-700">小隊（不勾選＝全部小隊共用一列）</div>
            {teamNames.length === 0 ? (
              <p className="text-sm text-gray-500">尚未分隊（由資料整理系統產生小隊後即可選擇）</p>
            ) : (
              <div className="flex flex-wrap gap-3 text-sm">
                {teamNames.map((t) => (
                  <label key={t} className="flex items-center gap-1">
                    <input type="checkbox" name="team" value={t} /> {t}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div>
            <SubmitButton>新增</SubmitButton>
          </div>
        </form>
      </Card>
      <Card title={`時間表（${sorted.length}）`}>
        {sorted.length === 0 ? (
          <Empty>尚無時段</Empty>
        ) : (
          <Table head={['小隊', '日期', '開始', '結束', '地點', '內容', '']}>
            {sorted.map((r) => {
              const formId = `slot-${r.時段ID}`;
              return (
                <tr key={r.時段ID}>
                  <td className="px-2 py-1 font-medium">{r.小隊}</td>
                  <td className="px-2 py-1"><Input form={formId} type="date" name="date" defaultValue={r.日期} /></td>
                  <td className="px-2 py-1"><Input form={formId} type="time" name="start" defaultValue={r.開始} /></td>
                  <td className="px-2 py-1"><Input form={formId} type="time" name="end" defaultValue={r.結束} /></td>
                  <td className="px-2 py-1"><Input form={formId} name="location" defaultValue={r.地點} /></td>
                  <td className="px-2 py-1"><Input form={formId} name="content" defaultValue={r.內容} /></td>
                  <td className="whitespace-nowrap px-2 py-1">
                    <form id={formId} action={updateSlot.bind(null, params.eventId, r.時段ID)} className="inline">
                      <SubmitButton size="sm" variant="secondary">儲存</SubmitButton>
                    </form>
                    <form action={deleteSlot.bind(null, params.eventId, r.時段ID)} className="inline">
                      <Button size="sm" variant="ghost" className="text-red-600">刪除</Button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
