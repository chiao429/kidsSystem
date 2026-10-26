'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Alert } from '@kids/ui';
import type { EventRules } from '@kids/schema';
import type { FormResult } from '@kids/ui/client';
import { EventForm } from './EventForm';
import type { EventRow } from '@/lib/events';
import { workbookToTemplate } from '@/lib/template-xlsx';

/** 新增活動：可先選擇活動範本檔（Excel 或 JSON），表單會帶入範本的設定，儲存時一併建立課程、時間表與問卷 */
export function NewEventFromTemplate({
  action,
  defaultId,
  sheetRequired,
  showSheet,
}: {
  action: (state: FormResult, formData: FormData) => Promise<FormResult>;
  defaultId: string;
  sheetRequired: boolean;
  showSheet?: boolean;
}) {
  const [template, setTemplate] = useState<{ text: string; event: EventRow; rules: EventRules; counts: string; file: string } | null>(null);
  const [error, setError] = useState('');

  const load = async (file: File | undefined) => {
    setError('');
    if (!file) return setTemplate(null);
    try {
      // Excel（.xlsx／.xls）先轉成與 JSON 範本相同的資料，送到伺服器的格式一樣
      let t;
      if (/\.json$/i.test(file.name)) t = JSON.parse(await file.text());
      else {
        const parsed = workbookToTemplate(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
        if (typeof parsed === 'string') {
          setTemplate(null);
          return setError(parsed);
        }
        t = parsed;
      }
      const text = JSON.stringify(t);
      if (t?.format !== 'kids-event-template') throw new Error();
      const n = (k: string, type?: string) => (Array.isArray(t[k]) ? t[k].filter((r: Record<string, string>) => !type || r.類型 === type).length : 0);
      setTemplate({
        text,
        file: file.name,
        event: { ...t.event, 活動ID: '' } as EventRow,
        rules: t.rules ?? {},
        counts: `課程 ${n('groups', '課程')}、小隊 ${n('groups', '小隊')}、時間表 ${n('schedules')}、問卷 ${n('surveys')}`,
      });
    } catch {
      setTemplate(null);
      setError('這不是活動範本檔（請用活動清單的「匯出範本」產生）');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-gray-300 p-4">
        <label className="block text-sm font-medium text-gray-700">
          從活動範本建立（選填）
          <input type="file" accept=".xlsx,.xls,.json" className="mt-2 block text-sm" onChange={(e) => void load(e.target.files?.[0])} />
        </label>
        <p className="mt-1 text-xs text-gray-500">選擇活動清單「匯出範本」下載的 Excel（或舊的 JSON 範本），會帶入活動設定與報名頁內容，並一併建立課程、小隊、時間表與問卷；只有課程的 Excel（課程匯入檔）也可以，活動設定再在下方填寫。</p>
        {error && <div className="mt-2"><Alert>{error}</Alert></div>}
        {template && (
          <p className="mt-2 text-sm text-emerald-700">
            已讀取 {template.file}：{template.counts}。請確認日期與報名時間後儲存。
          </p>
        )}
      </div>
      <EventForm
        key={template?.file ?? 'blank'}
        action={action}
        defaultId={defaultId}
        sheetRequired={sheetRequired}
        showSheet={showSheet}
        copyFrom={template?.event}
        copyLabel="範本"
        rules={template?.rules}
        template={template?.text}
      />
    </div>
  );
}
