import { EventStatus, GRADE_OPTIONS, GROUP_TYPES, type EventRules } from '@kids/schema';
import { Field, Input, Select } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import type { EventRow } from '@/lib/events';

/** 封存只能從活動清單操作，不出現在狀態選單 */
const STATUS_OPTIONS = Object.values(EventStatus).filter((s) => s !== EventStatus.Archived);

/**
 * 活動設定：只放必要欄位。活動時間、地點、報到／繳費時間等資訊改寫在「活動說明」分頁裡；
 * 這些舊欄位與活動說明都不在表單上，更新時會保留原值（見 event-actions 的 readEventForm）。
 */
export function EventForm({
  action,
  event,
  rules = {},
  defaultId,
  sheetRequired,
}: {
  action: (state: FormResult, formData: FormData) => Promise<FormResult>;
  event?: EventRow;
  rules?: EventRules;
  /** 新增時預設的活動ID */
  defaultId?: string;
  /** 純 Google Sheets 模式時活動資料就在試算表裡，必須填寫 */
  sheetRequired: boolean;
}) {
  // 新活動預設只用課程；既有活動依原本的設定
  const groupTypes = event ? (rules.groupTypes ?? (rules.grouping === 'course' ? ['課程'] : ['小隊'])) : ['課程'];
  return (
    <ActionForm action={action} className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="活動名稱" required>
            <Input name="name" defaultValue={event?.名稱} required />
          </Field>
        </div>
        <Field label="開始日期" required>
          <Input type="date" name="startDate" defaultValue={event?.開始日期} required />
        </Field>
        <Field label="結束日期" hint="一天的活動可以留空">
          <Input type="date" name="endDate" defaultValue={event?.結束日期} />
        </Field>
        <Field label="狀態" hint="「開放報名」時家長才看得到報名按鈕">
          <Select name="status" defaultValue={event?.狀態 || EventStatus.Draft}>
            {STATUS_OPTIONS.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </Select>
        </Field>
      </section>

      <fieldset className="grid gap-4 rounded-2xl border border-gray-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-gray-700">報名</legend>
        <Field label="報名開放" hint="留空表示狀態改為開放報名後立即開放">
          <Input type="datetime-local" name="regOpen" defaultValue={event?.報名開放} />
        </Field>
        <Field label="報名截止">
          <Input type="datetime-local" name="regClose" defaultValue={event?.報名截止} />
        </Field>
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
        <Field label="每位兒童最多選課數" hint="0 表示不限；填 1 即只能選一門">
          <Input type="number" min={0} name="maxCoursesPerMember" defaultValue={rules.maxCoursesPerMember ?? 0} />
        </Field>
        <Field label="活動總名額" hint="0 表示不限；額滿後轉備取">
          <Input type="number" min={0} name="capacity" defaultValue={rules.capacity ?? 0} />
        </Field>
        <div className="space-y-2 text-sm sm:col-span-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="autoAccept" defaultChecked={rules.autoAccept ?? true} /> 自動正取（不勾選則為待審核）
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="allowOnSiteCourseRegistration" defaultChecked={rules.allowOnSiteCourseRegistration ?? true} /> 允許現場報名課程
          </label>
        </div>
      </fieldset>

      {/* 新增活動且必須填試算表時預設展開，避免必填欄位藏在收合區塊裡無法送出 */}
      <details open={!event && sheetRequired} className="rounded-2xl border border-gray-200 p-4 [&[open]>summary]:mb-4">
        <summary className="cursor-pointer text-sm font-semibold text-gray-700">進階設定</summary>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="活動ID" hint={event ? '建立後不可修改' : '英數字，用在網址上；預設 kids＋今天日期'} required>
            <Input name="id" defaultValue={event?.活動ID ?? defaultId} readOnly={!!event} pattern="[A-Za-z0-9_\-]+" required />
          </Field>
          <Field label="使用的分組" hint="小隊相關的分頁（小隊、時間表）只有勾選小隊時才會出現">
            <div className="flex gap-4 pt-2 text-sm">
              {GROUP_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-1.5">
                  <input type="checkbox" name="groupTypes" value={t} defaultChecked={groupTypes.includes(t)} /> {t}
                </label>
              ))}
            </div>
          </Field>
          <div className="sm:col-span-2">
            <Field
              label="活動試算表連結"
              hint={sheetRequired ? '建立一份空白試算表並共用給 service account，貼上網址' : '選填：要同步到 Google Sheet 鏡像時才需要'}
              required={sheetRequired}
            >
              <Input name="sheet" defaultValue={event?.活動試算表} required={sheetRequired} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="existingOnly" defaultChecked={rules.existingOnly ?? false} /> 只開放已有資料的家庭報名
          </label>
        </div>
      </details>

      <SubmitButton>儲存</SubmitButton>
    </ActionForm>
  );
}
