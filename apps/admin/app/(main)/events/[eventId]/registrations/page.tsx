import { revalidatePath } from 'next/cache';
import { Badge, Card, Empty, Input, Select, Stat, Table } from '@kids/ui';
import { SubmitButton } from '@kids/ui/client';
import { requireSession } from '@kids/auth/next';
import { GroupRole, GroupType, RegistrationStatus, gradeRank, newId, nowString } from '@kids/schema';
import { getEvent } from '@/lib/events';
import { writeLog } from '@/lib/log';
import { loadGroupState } from '@/lib/groups';
import { groupMembers, registrations } from '@/lib/tables';

async function updateStatus(eventId: string, formData: FormData) {
  'use server';
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const ids = formData.getAll('ids').map(String);
  const 狀態 = String(formData.get('status'));
  if (ids.length === 0 || !(Object.values(RegistrationStatus) as string[]).includes(狀態)) return;
  await registrations(event.活動ID).updateByIds(ids.map((id) => ({ id, changes: { 狀態 } })));
  await writeLog(event.活動ID, session, `報名狀態改為${狀態}`, ids.join(','));
  revalidatePath(`/events/${eventId}/registrations`);
}

async function updateNote(eventId: string, 報名ID: string, formData: FormData) {
  'use server';
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const 備註 = String(formData.get('note') ?? '').trim().slice(0, 500);
  await registrations(event.活動ID).updateByIds([{ id: 報名ID, changes: { 備註 } }]);
  await writeLog(event.活動ID, session, '修改報名備註', 報名ID, 備註);
  revalidatePath(`/events/${eventId}/registrations`);
}

/** 調整選課：依勾選結果新增或刪除課程分組成員 */
async function updateCourses(eventId: string, 報名ID: string, formData: FormData) {
  'use server';
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const reg = (await registrations(event.活動ID).all({ fresh: true })).find((r) => r.報名ID === 報名ID);
  if (!reg) return;
  const state = await loadGroupState(event.活動ID, true);
  const picked = new Set(formData.getAll('courses').map(String).filter((id) => state.courses.some((c) => c.分組ID === id)));
  const current = state.coursesOf(報名ID, reg.成員ID);
  const removeIds = current.filter((m) => !picked.has(m.分組ID)).map((m) => m.分組成員ID);
  const now = nowString();
  const add = [...picked]
    .filter((id) => !current.some((m) => m.分組ID === id))
    .map((分組ID) => ({
      分組成員ID: newId('分組成員ID'), 分組ID, 類型: GroupType.Course, 成員ID: reg.成員ID, 姓名: reg.姓名,
      報名ID, 角色: GroupRole.Student, 來源: '後台', 建立時間: now,
    }));
  await groupMembers(event.活動ID).deleteByIds(removeIds);
  await groupMembers(event.活動ID).append(add);
  await writeLog(event.活動ID, session, '調整選課', 報名ID, [...picked].map((id) => state.byId.get(id)?.名稱).join('、'));
  revalidatePath(`/events/${eventId}/registrations`);
}

const tone = { 正取: 'green', 備取: 'amber', 待審核: 'blue', 取消: 'gray' } as const;

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: { eventId: string };
  searchParams: { q?: string; status?: string; edit?: string };
}) {
  const event = await getEvent(params.eventId);
  const [all, state] = await Promise.all([registrations(event.活動ID).all(), loadGroupState(event.活動ID)]);
  const courseText = (r: (typeof all)[number]) => state.courseNames(r.報名ID, r.成員ID);
  const editing = all.find((r) => r.報名ID === searchParams.edit);
  const q = (searchParams.q ?? '').trim();
  const rows = all
    .filter((r) => !searchParams.status || r.狀態 === searchParams.status)
    .filter((r) => !q || [r.姓名, r.報名ID, r.家庭ID, courseText(r)].some((v) => v.includes(q)))
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
      {editing && state.courses.length > 0 && (
        <Card title={`調整選課：${editing.姓名}`}>
          <form action={updateCourses.bind(null, params.eventId, editing.報名ID)} className="space-y-3">
            <div className="flex flex-wrap gap-3 text-sm">
              {state.courses.map((c) => (
                <label key={c.分組ID} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="courses"
                    value={c.分組ID}
                    defaultChecked={state.coursesOf(editing.報名ID, editing.成員ID).some((m) => m.分組ID === c.分組ID)}
                  />
                  {c.名稱}
                  {c.狀態 === '停用' && <span className="text-gray-400">（停用）</span>}
                </label>
              ))}
            </div>
            <SubmitButton size="sm">儲存選課</SubmitButton>
          </form>
        </Card>
      )}
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
            <Table head={['', '姓名', '年級', '類型', '課程', '狀態', '備註', '來源', '報名時間', '報名ID']}>
              {rows.map((r) => (
                <tr key={r.報名ID}>
                  <td className="px-2 py-2">
                    <input type="checkbox" name="ids" value={r.報名ID} />
                  </td>
                  <td className="px-2 py-2 font-medium">{r.姓名}</td>
                  <td className="px-2 py-2">{r.年級}</td>
                  <td className="px-2 py-2">{r.報名類型}</td>
                  <td className="px-2 py-2">
                    {courseText(r)}
                    {state.courses.length > 0 && (
                      <a href={`?edit=${r.報名ID}`} className="ml-1 text-xs text-purple-700 underline">
                        調整
                      </a>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Badge tone={tone[r.狀態 as keyof typeof tone] ?? 'gray'}>{r.狀態}</Badge>
                  </td>
                  <td className="px-2 py-2">
                    <Input form={`note-${r.報名ID}`} name="note" defaultValue={r.備註} className="min-w-[8rem] text-xs" />
                    <SubmitButton form={`note-${r.報名ID}`} size="sm" variant="ghost">
                      存
                    </SubmitButton>
                  </td>
                  <td className="px-2 py-2">{r.來源}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-gray-500">{r.報名時間}</td>
                  <td className="px-2 py-2 font-mono text-xs text-gray-500">{r.報名ID}</td>
                </tr>
              ))}
            </Table>
          </form>
        )}
        {rows.map((r) => (
          <form key={r.報名ID} id={`note-${r.報名ID}`} action={updateNote.bind(null, params.eventId, r.報名ID)} />
        ))}
      </Card>
    </>
  );
}
