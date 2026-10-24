import { EventStatus, EventVersion, GRADE_OPTIONS, GROUP_TYPES, type EventRules } from '@kids/schema';
import { Field, Input, Select, Textarea } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import type { EventRow } from '@/lib/events';

function toLocal(v: string | undefined) {
  // Sheet 內存 "2026-10-09T09:00" 形式，直接給 datetime-local
  return v ?? '';
}

export function EventForm({
  action,
  event,
  rules = {},
  defaultId,
}: {
  action: (state: FormResult, formData: FormData) => Promise<FormResult>;
  event?: EventRow;
  rules?: EventRules;
  /** 新增時預設的活動ID */
  defaultId?: string;
}) {
  const groupTypes = rules.groupTypes ?? (rules.grouping === 'course' ? ['課程'] : ['小隊']);
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="活動ID" hint="英數字，建立後不可修改；預設 kids＋今天日期" required>
        <Input name="id" defaultValue={event?.活動ID ?? defaultId} readOnly={!!event} pattern="[A-Za-z0-9_\-]+" required />
      </Field>
      <Field label="名稱" required>
        <Input name="name" defaultValue={event?.名稱} required />
      </Field>
      <Field label="版本">
        <Select name="version" defaultValue={event?.版本 || EventVersion.Kids}>
          {Object.values(EventVersion).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </Field>
      <Field label="狀態">
        <Select name="status" defaultValue={event?.狀態 || EventStatus.Draft}>
          {Object.values(EventStatus).map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
      </Field>
      <div className="sm:col-span-2">
        <Field label="活動試算表連結" hint="建立一份空白試算表並共用給 service account，貼上網址" required>
          <Input name="sheet" defaultValue={event?.活動試算表} required />
        </Field>
      </div>
      <Field label="開始日期">
        <Input type="date" name="startDate" defaultValue={event?.開始日期} />
      </Field>
      <Field label="結束日期">
        <Input type="date" name="endDate" defaultValue={event?.結束日期} />
      </Field>
      <Field label="活動時間">
        <Input name="eventTime" defaultValue={event?.活動時間} placeholder="09:00–16:00" />
      </Field>
      <Field label="地點">
        <Input name="venue" defaultValue={event?.地點} />
      </Field>
      <Field label="報到時間">
        <Input name="checkInTime" defaultValue={event?.報到時間} />
      </Field>
      <Field label="繳費時間">
        <Input name="paymentTime" defaultValue={event?.繳費時間} />
      </Field>
      <Field label="報名開放">
        <Input type="datetime-local" name="regOpen" defaultValue={toLocal(event?.報名開放)} />
      </Field>
      <Field label="報名截止">
        <Input type="datetime-local" name="regClose" defaultValue={toLocal(event?.報名截止)} />
      </Field>

      <fieldset className="grid gap-4 rounded-lg border border-gray-200 p-4 sm:col-span-2 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-gray-700">報名規則</legend>
        <Field label="最低年級">
          <Select name="minGrade" defaultValue={rules.minGrade ?? ''}>
            <option value="">不限</option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="最高年級">
          <Select name="maxGrade" defaultValue={rules.maxGrade ?? ''}>
            <option value="">不限</option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </Select>
        </Field>
        <Field label="名額" hint="0 表示不限；額滿後轉備取">
          <Input type="number" min={0} name="capacity" defaultValue={rules.capacity ?? 0} />
        </Field>
        <Field label="每位兒童最多選課數" hint="0 表示不限；例如填 1 即只能選一門">
          <Input type="number" min={0} name="maxCoursesPerMember" defaultValue={rules.maxCoursesPerMember ?? 0} />
        </Field>
        <Field label="啟用的分組類型" hint="可同時啟用；課程請在活動的「分組」頁建立">
          <div className="flex gap-4 pt-2 text-sm">
            {GROUP_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-1.5">
                <input type="checkbox" name="groupTypes" value={t} defaultChecked={groupTypes.includes(t)} /> {t}
              </label>
            ))}
          </div>
        </Field>
        <div className="space-y-2 pt-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoAccept" defaultChecked={rules.autoAccept ?? true} /> 自動正取（否則為待審核）
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="existingOnly" defaultChecked={rules.existingOnly ?? false} /> 只開放已有資料的家庭報名
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="allowOnSiteCourseRegistration" defaultChecked={rules.allowOnSiteCourseRegistration ?? true} /> 允許現場報名課程
          </label>
        </div>
      </fieldset>

      <div className="sm:col-span-2">
        <Field label="活動說明">
          <Textarea name="description" rows={3} defaultValue={event?.活動說明} />
        </Field>
      </div>
      <Field label="適用對象">
        <Input name="audience" defaultValue={event?.適用對象} />
      </Field>
      <Field label="報名提醒">
        <Input name="reminder" defaultValue={event?.報名提醒} />
      </Field>
      <div className="sm:col-span-2">
        <Field label="備註">
          <Textarea name="note" rows={2} defaultValue={event?.備註} />
        </Field>
      </div>
      <div className="sm:col-span-2">
        <SubmitButton>儲存</SubmitButton>
      </div>
    </ActionForm>
  );
}
