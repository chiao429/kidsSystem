import { EventStatus, EventVersion, GRADE_OPTIONS, type EventRules } from '@kids/schema';
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
}: {
  action: (state: FormResult, formData: FormData) => Promise<FormResult>;
  event?: EventRow;
  rules?: EventRules;
}) {
  const courses = (rules.courses ?? []).map((c) => (c.capacity ? `${c.name}|${c.capacity}` : c.name)).join('\n');
  return (
    <ActionForm action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="活動ID" hint="英數字，建立後不可修改，例如 2026-winter" required>
        <Input name="id" defaultValue={event?.活動ID} readOnly={!!event} pattern="[A-Za-z0-9_\-]+" required />
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
        <div className="space-y-2 pt-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoAccept" defaultChecked={rules.autoAccept ?? true} /> 自動正取（否則為待審核）
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="existingOnly" defaultChecked={rules.existingOnly ?? false} /> 只開放已有資料的家庭報名
          </label>
        </div>
        <div className="sm:col-span-2">
          <Field label="課程" hint="一行一個，可加「|名額」，例如：美勞課|30">
            <Textarea name="courses" rows={3} defaultValue={courses} />
          </Field>
        </div>
      </fieldset>

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
