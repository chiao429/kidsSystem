import { canAccessEvent } from '@kids/auth';
import { requireSession } from '@kids/auth/next';
import { Card, Field, Input, Select } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import { extractSheetIdFromUrl } from '@kids/sheets-core';
import { getEvent } from '@kids/registration-core/lib/events';
import { importRows, readSheet, readUpload } from '@kids/registration-core/lib/import';
import { events } from '@kids/registration-core/lib/tables';

async function runImport(_: FormResult, formData: FormData): Promise<FormResult> {
  'use server';
  const eventId = String(formData.get('eventId') ?? '');
  requireSession({ permission: 'import', eventId });
  const event = await getEvent(eventId);
  if (!event) return { error: '找不到活動' };

  const file = formData.get('file');
  const sheetUrl = String(formData.get('sheetUrl') ?? '').trim();
  const tab = String(formData.get('tab') ?? '').trim();
  let raw;
  try {
    if (file instanceof File && file.size > 0) raw = await readUpload(file);
    else if (sheetUrl && tab) raw = await readSheet(extractSheetIdFromUrl(sheetUrl), tab);
    else return { error: '請上傳 Excel 檔，或填寫試算表連結與分頁名稱' };
  } catch (e) {
    return { error: `讀取失敗：${e instanceof Error ? e.message : e}` };
  }

  const dryRun = formData.get('commit') !== 'on';
  const s = await importRows(event, raw, dryRun);
  const lines = [
    dryRun ? '【預覽，尚未寫入】' : '【已匯入】',
    `共 ${s.total} 列：新家庭 ${s.newHouseholds}、新成員 ${s.newMembers}、新報名 ${s.newRegistrations}、已報名略過 ${s.alreadyRegistered}`,
    ...(s.skipped.length ? [`略過 ${s.skipped.length} 列：${s.skipped.slice(0, 20).join('；')}${s.skipped.length > 20 ? '…' : ''}`] : []),
  ];
  return { message: lines.join('\n') };
}

export default async function ImportPage() {
  const session = requireSession({ permission: 'import' });
  const list = (await events().all()).filter((e) => canAccessEvent(session, e.活動ID));
  return (
    <Card title="匯入舊報名資料">
      <p className="mb-4 text-sm text-gray-600">
        支援 eventDataClean / 舊報名表格式：兒童姓名、性別、年級、學校、家長姓名、家長行動電話、報名序號、備註。
        依「家長電話」（沒有電話時用家長姓名）合併成同一家庭；已報名的成員會略過。
      </p>
      <ActionForm action={runImport} className="grid gap-4 whitespace-pre-line">
        <Field label="匯入到活動" required>
          <Select name="eventId" required>
            {list.map((e) => (
              <option key={e.活動ID} value={e.活動ID}>
                {e.名稱}（{e.活動ID}）
              </option>
            ))}
          </Select>
        </Field>
        <Field label="上傳 Excel（.xlsx / .xls / .csv）">
          <Input type="file" name="file" accept=".xlsx,.xls,.csv" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="或：Google 試算表連結" hint="需共用給 service account">
            <Input name="sheetUrl" />
          </Field>
          <Field label="分頁名稱">
            <Input name="tab" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="commit" /> 確認寫入（不勾選只預覽結果）
        </label>
        <div>
          <SubmitButton>執行</SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
