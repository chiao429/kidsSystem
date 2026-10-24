import { revalidatePath } from 'next/cache';
import { Button, Card, Empty, Field, Input, Table, Textarea } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { GROUP_TYPES, groupsOfType, hasGroupType, newId, type Group } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { writeLog } from '@/lib/log';
import { groups, schedules } from '@/lib/tables';

async function addSlot(eventId: string, formData: FormData) {
  'use server';
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  // 對象：「type:小隊」=全部小隊、「type:課程」=全部課程、其餘為分組ID；不勾選＝全部
  const picked = formData.getAll('target').map(String).filter(Boolean);
  const base = { 日期: s('date'), 開始: s('start'), 結束: s('end'), 地點: s('location'), 內容: s('content') };
  const targets = (picked.length > 0 ? picked : ['type:']).map((t) =>
    t.startsWith('type:') ? { 分組ID: '', 分組類型: t.slice(5) } : { 分組ID: t, 分組類型: '' },
  );
  // 勾選多個對象時，每個對象一列（地點可之後個別修改）
  await schedules(event.活動ID).append(targets.map((t) => ({ 時段ID: newId('時段ID'), ...t, ...base })));
  await writeLog(event.活動ID, session, '新增時段', '', `${base.日期} ${base.開始}-${base.結束} ${picked.join(',') || '全部'}`);
  revalidatePath(`/events/${eventId}/schedule`);
}

/** 匯入舊版 groupSchedule.json：{ "小隊": [{ "area", "time": "9:41-9:56", "place" }] } */
async function importJson(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  'use server';
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const date = String(formData.get('date') ?? '').trim();
  let data: Record<string, { area?: string; time?: string; place?: string; content?: string }[]>;
  try {
    data = JSON.parse(String(formData.get('json') ?? ''));
  } catch {
    return { error: 'JSON 格式錯誤' };
  }
  const pad = (t: string) => t.trim().replace(/^(\d):/, '0$1:');
  const gg = await groups(event.活動ID).all();
  const unknown: string[] = [];
  const rows = Object.entries(data).flatMap(([name, list]) =>
    (Array.isArray(list) ? list : []).map((x) => {
      const [開始 = '', 結束 = ''] = String(x.time ?? '').split('-');
      const all = name === '全部';
      const g = gg.find((y) => y.名稱 === name);
      if (!all && !g) unknown.push(name);
      return { 時段ID: newId('時段ID'), 分組ID: g?.分組ID ?? '', 分組類型: all ? '' : g?.類型 ?? '', 日期: date, 開始: pad(開始), 結束: pad(結束), 地點: String(x.place ?? ''), 內容: String(x.content ?? x.area ?? '') };
    }),
  );
  if (rows.length === 0) return { error: '沒有可匯入的時段' };
  if (unknown.length > 0) return { error: `找不到分組：${Array.from(new Set(unknown)).join('、')}（請先建立分組或修正名稱）` };
  await schedules(event.活動ID).append(rows);
  await writeLog(event.活動ID, session, '匯入時間表', '', `${rows.length} 筆`);
  revalidatePath(`/events/${eventId}/schedule`);
  return { message: `已匯入 ${rows.length} 個時段` };
}

async function updateSlot(eventId: string, id: string, formData: FormData) {
  'use server';
  requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const s = (k: string) => String(formData.get(k) ?? '').trim();
  await schedules(event.活動ID).updateByIds([
    { id, changes: { 日期: s('date'), 開始: s('start'), 結束: s('end'), 地點: s('location'), 內容: s('content') } },
  ]);
  revalidatePath(`/events/${eventId}/schedule`);
}

async function deleteSlot(eventId: string, id: string) {
  'use server';
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  await schedules(event.活動ID).deleteByIds([id]);
  await writeLog(event.活動ID, session, '刪除時段', id);
  revalidatePath(`/events/${eventId}/schedule`);
}

export default async function SchedulePage({ params }: { params: { eventId: string } }) {
  const event = await getEvent(params.eventId);
  const [slots, gg] = await Promise.all([schedules(event.活動ID).all(), groups(event.活動ID).all()]);
  const types = GROUP_TYPES.filter((t) => hasGroupType(event.rules, t));
  const byType = types.map((t) => ({ type: t, list: groupsOfType(gg, t) }));
  const groupById = new Map<string, Group>(gg.map((g) => [g.分組ID, g]));
  const targetLabel = (r: { 分組ID: string; 分組類型: string }) =>
    r.分組ID ? groupById.get(r.分組ID)?.名稱 ?? r.分組ID : r.分組類型 ? `全部${r.分組類型}` : '全部';
  const sorted = [...slots].sort(
    (a, b) => a.日期.localeCompare(b.日期) || a.開始.localeCompare(b.開始) || targetLabel(a).localeCompare(targetLabel(b), 'zh-Hant'),
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
            <div className="mb-1 text-sm font-medium text-gray-700">對象（不勾選＝全部共用一列）</div>
            {byType.map(({ type, list }) => (
              <div key={type} className="mb-1 flex flex-wrap gap-3 text-sm">
                <label className="flex items-center gap-1 font-medium">
                  <input type="checkbox" name="target" value={`type:${type}`} /> 全部{type}
                </label>
                {list.length === 0 ? (
                  <span className="text-gray-500">{type === '課程' ? '尚未建立課程（到「課程」頁新增）' : '尚未分隊（由資料整理系統產生小隊後即可選擇）'}</span>
                ) : (
                  list.map((g) => (
                    <label key={g.分組ID} className="flex items-center gap-1">
                      <input type="checkbox" name="target" value={g.分組ID} /> {g.名稱}
                    </label>
                  ))
                )}
              </div>
            ))}
          </div>
          <div>
            <SubmitButton>新增</SubmitButton>
          </div>
        </form>
      </Card>
      <Card title="匯入舊版時間表（groupSchedule.json）">
        <ActionForm action={importJson.bind(null, params.eventId)} className="grid gap-3">
          <Field label="日期" required>
            <Input type="date" name="date" defaultValue={event.開始日期} required className="max-w-xs" />
          </Field>
          <Field label="JSON" hint='格式：{ "D001": [{ "area": "綠區", "time": "9:41-9:56", "place": "201教室" }] }'>
            <Textarea name="json" rows={4} className="font-mono text-xs" />
          </Field>
          <div>
            <SubmitButton variant="secondary">匯入</SubmitButton>
          </div>
        </ActionForm>
      </Card>
      <Card title={`時間表（${sorted.length}）`}>
        {sorted.length === 0 ? (
          <Empty>尚無時段</Empty>
        ) : (
          <Table head={['對象', '日期', '開始', '結束', '地點', '內容', '']}>
            {sorted.map((r) => {
              const formId = `slot-${r.時段ID}`;
              return (
                <tr key={r.時段ID}>
                  <td className="px-2 py-1 font-medium">{targetLabel(r)}</td>
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
