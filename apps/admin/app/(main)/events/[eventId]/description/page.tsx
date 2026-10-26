import Link from 'next/link';
import { Alert, Card, Field, Input, Select, Table, parentUrl } from '@kids/ui';
import { ActionForm, SubmitButton } from '@kids/ui/client';
import { RichText } from '@kids/ui/rich-text';
import { requireSession } from '@kids/auth/next';
import { EventStatus, GroupType, courseGroupNames, groupsOfType, parseCoursePanels } from '@kids/schema';
import { DescriptionEditor } from '@/components/DescriptionEditor';
import { EventInfoForm } from '@/components/EventInfoForm';
import { SectionToggle } from '@/components/SectionToggle';
import { saveCoursePanels } from '@/lib/event-actions';
import { CHECKIN_PRESETS, CHECKIN_SUFFIX, COURSE_PANEL_DEFAULTS, OTHER, TIME_PRESETS, VENUE_PRESETS, dateLabel, parseDated } from '@/lib/event-info';
import { groups } from '@/lib/tables';
import { getEvent } from '@/lib/events';
import { setEventSignature } from '@/lib/signature-actions';
import { SIGNATURE_NONE, effectiveSignature, listSignatures } from '@/lib/signatures';

export default async function EventDescriptionPage({ params }: { params: { eventId: string } }) {
  const session = requireSession({ permission: 'admin', eventId: params.eventId });
  const [event, all, allGroups] = await Promise.all([getEvent(params.eventId), listSignatures(), groups(params.eventId).all()]);
  const fallback = all.find((s) => s.預設 === 'Y');
  const current = effectiveSignature(event.簽名檔, all);
  // 時間與地點：拆回表單值；還沒設定時日期預設為活動開始日期，報到時間預設加上繳費說明
  const year = event.開始日期.slice(0, 4);
  const time = parseDated(event.活動時間, TIME_PRESETS, year);
  const checkin = parseDated(event.報到時間, CHECKIN_PRESETS, year, true);
  if (!time.date) time.date = event.開始日期;
  if (!checkin.date) checkin.date = event.開始日期;
  if (!event.報到時間) checkin.suffix = CHECKIN_SUFFIX;
  // 家長頁隱藏的區塊（課程分組、補充資訊、簽名檔）
  const hidden = new Set(event.rules.hiddenSections ?? []);
  const venuePreset = !event.地點 || (VENUE_PRESETS as readonly string[]).includes(event.地點);
  // 課程分組卡片：依課程的「課程分組」產生；標題日期與活動資訊共用
  const courses = groupsOfType(allGroups, GroupType.Course);
  const panelNames = courseGroupNames(courses);
  const saved = parseCoursePanels(event.分組說明);
  const panelDate = event.活動時間.match(/^\d{1,2}\/\d{1,2}\([日一二三四五六]\)/)?.[0] ?? dateLabel(event.開始日期);
  const venue = { choice: venuePreset ? event.地點 || VENUE_PRESETS[0] : OTHER, other: venuePreset ? '' : event.地點 };
  return (
    <>
      {event.狀態 !== EventStatus.Open && (
        <Alert tone="blue">目前狀態為「{event.狀態 || EventStatus.Draft}」，預覽家長頁時看得到活動說明，但不會出現報名按鈕；改成「開放報名」後家長才能報名。</Alert>
      )}
      <Card title="時間與地點">
        <EventInfoForm eventId={params.eventId} time={time} venue={venue} checkin={checkin} show={!event.rules.hideEventInfo} neverSaved={!event.活動時間 && !event.地點 && !event.報到時間} />
      </Card>
      {panelNames.length > 0 ? (
        <Card title="課程分組">
          <ActionForm action={saveCoursePanels.bind(null, params.eventId)} className="space-y-6">
            <input type="hidden" name="panelCount" value={panelNames.length} />
            {panelNames.map((name, i) => {
              const text = saved[name] ?? COURSE_PANEL_DEFAULTS[name] ?? { 對象: '', 內容: '' };
              const list = courses.filter((c) => (c.課程分組?.trim() || '課程') === name);
              return (
                <section key={name} className="space-y-3 rounded-2xl border border-gray-200 p-4">
                  <input type="hidden" name={`panelGroup-${i}`} value={name} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold">
                      ★【{panelDate}
                      {name}】{!saved[name] && COURSE_PANEL_DEFAULTS[name] && <span className="ml-2 text-xs font-normal text-amber-600">已帶入預設文字，儲存後生效</span>}
                    </h3>
                    <SectionToggle eventId={params.eventId} section={`panel:${name}`} initial={!hidden.has(`panel:${name}`)} />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="對象">
                      <Input name={`panelAudience-${i}`} defaultValue={text.對象} />
                    </Field>
                    <Field label="內容">
                      <Input name={`panelContent-${i}`} defaultValue={text.內容} />
                    </Field>
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-500">課程表格（依「課程」頁的設定自動產生）</div>
                    <Table head={['課程名稱', '課程人數', '課程注意事項']}>
                      {list.map((c) => (
                        <tr key={c.分組ID}>
                          <td className="px-2 py-1.5">
                            {c.名稱}
                            {Number(c.材料費) > 0 && <div className="text-xs text-gray-500">（酌收報名材料費{c.材料費}元）</div>}
                          </td>
                          <td className="px-2 py-1.5">{c.名額 ? `${c.名額}人` : '不限'}</td>
                          <td className="whitespace-pre-line px-2 py-1.5 text-gray-600">{c.注意事項 || '無'}</td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                </section>
              );
            })}
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton>儲存課程分組</SubmitButton>
              <Link href={`/events/${params.eventId}/groups`} className="text-sm text-[#315bc7] underline">
                到「課程」頁修改課程
              </Link>
            </div>
          </ActionForm>
        </Card>
      ) : (
        <Card title="課程分組">
          <p className="text-sm text-gray-500">這場活動還沒有啟用中的課程。到「課程」頁新增課程並填寫「課程分組」（例如角落活動、歡樂小站），這裡就會出現對應的卡片。</p>
        </Card>
      )}
      {/* 家長報名頁在家長端（apps/parents），跨系統用完整網址 */}
      <DescriptionEditor
        eventId={params.eventId}
        initial={event.活動說明}
        previewUrl={parentUrl(`/e/${event.活動ID}`)}
        visibility={<SectionToggle eventId={params.eventId} section="supplement" initial={!hidden.has('supplement')} />}
      />

      <Card
        title="簽名檔"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <SectionToggle eventId={params.eventId} section="signature" initial={!hidden.has('signature')} />
            {session.permissions.includes('signatures') && (
              <Link href={current ? `/signatures/${current.簽名檔ID}` : '/signatures'} className="text-sm text-[#315bc7] underline">
                {current ? '編輯這個簽名檔' : '管理簽名檔'}
              </Link>
            )}
          </div>
        }
      >
        <ActionForm action={setEventSignature.bind(null, params.eventId)} className="mb-4 flex flex-wrap items-end gap-3">
          <div className="min-w-64">
            <Field label="顯示在活動說明下方">
              <Select name="signature" defaultValue={event.簽名檔 ?? ''}>
                <option value="">使用預設{fallback ? `（${fallback.名稱}）` : '（尚未設定預設）'}</option>
                {all.map((s) => (
                  <option key={s.簽名檔ID} value={s.簽名檔ID}>
                    {s.名稱}
                  </option>
                ))}
                <option value={SIGNATURE_NONE}>不使用簽名檔</option>
              </Select>
            </Field>
          </div>
          <SubmitButton variant="secondary">套用</SubmitButton>
        </ActionForm>
        {current ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-4">
            <div className="mb-2 text-xs text-gray-500">家長頁會顯示：{current.名稱}</div>
            <RichText html={current.內容} />
          </div>
        ) : (
          <p className="text-sm text-gray-500">這場活動不顯示簽名檔。</p>
        )}
      </Card>
    </>
  );
}
