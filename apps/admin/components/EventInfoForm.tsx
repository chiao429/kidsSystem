'use client';

import { useState } from 'react';
import { Field, Input } from '@kids/ui';
import { ActionForm, SubmitButton, type FormResult } from '@kids/ui/client';
import { CHECKIN_PRESETS, OTHER, TIME_PRESETS, VENUE_PRESETS, formatDated, type DatedValue } from '@/lib/event-info';

/** 一組單選（預設選項＋其他），選「其他」時才可輸入 */
function Choices({
  name,
  otherName,
  presets,
  value,
  other,
  onChange,
  placeholder,
}: {
  name: string;
  otherName: string;
  presets: readonly string[];
  value: string;
  other: string;
  onChange: (value: string, other: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {presets.map((p) => (
        <label key={p} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${value === p ? 'border-[#315bc7] bg-[#315bc7] text-white' : 'border-gray-300 bg-white text-gray-700'}`}>
          <input type="radio" name={name} value={p} checked={value === p} onChange={() => onChange(p, other)} className="sr-only" />
          {p}
        </label>
      ))}
      <label className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm ${value === OTHER ? 'border-[#315bc7]' : 'border-gray-300'} bg-white`}>
        <input type="radio" name={name} value={OTHER} checked={value === OTHER} onChange={() => onChange(OTHER, other)} />
        其他
        <input
          name={otherName}
          value={other}
          placeholder={placeholder}
          onFocus={() => onChange(OTHER, other)}
          onChange={(e) => onChange(OTHER, e.target.value)}
          className="w-44 border-0 border-b border-gray-300 bg-transparent px-1 py-0.5 text-sm focus:border-[#315bc7] focus:outline-none"
        />
      </label>
    </div>
  );
}

/** 活動說明分頁的「時間與地點」：時間、地點、活動報到／繳費時間 */
export function EventInfoForm({
  action,
  time,
  venue,
  checkin,
}: {
  action: (state: FormResult, formData: FormData) => Promise<FormResult>;
  time: DatedValue;
  venue: { choice: string; other: string };
  checkin: DatedValue;
}) {
  const [t, setT] = useState(time);
  const [v, setV] = useState(venue);
  const [c, setC] = useState(checkin);
  const pick = (x: { choice: string; other: string }) => (x.choice === OTHER ? x.other : x.choice);
  const preview = [
    ['時間', formatDated(t.date, pick(t))],
    ['地點', pick(v).trim()],
    ['活動報到/繳費時間', formatDated(c.date, pick(c), c.suffix)],
  ].filter(([, text]) => text);

  return (
    <ActionForm action={action} className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr] sm:items-start">
        <Field label="活動日期">
          <Input type="date" name="infoDate" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} />
        </Field>
        <div className="space-y-1">
          <span className="text-sm font-semibold text-[#4b5565]">時間</span>
          <Choices name="infoTime" otherName="infoTimeOther" presets={TIME_PRESETS} value={t.choice} other={t.other} placeholder="例如：下午2:00-4:00" onChange={(choice, other) => setT({ ...t, choice, other })} />
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-sm font-semibold text-[#4b5565]">地點</span>
        <Choices name="venue" otherName="venueOther" presets={VENUE_PRESETS} value={v.choice} other={v.other} placeholder="輸入其他地點" onChange={(choice, other) => setV({ choice, other })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-[12rem_1fr] sm:items-start">
        <Field label="報到日期">
          <Input type="date" name="checkinDate" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} />
        </Field>
        <div className="space-y-2">
          <span className="text-sm font-semibold text-[#4b5565]">活動報到/繳費時間</span>
          <Choices name="checkinTime" otherName="checkinTimeOther" presets={CHECKIN_PRESETS} value={c.choice} other={c.other} placeholder="例如：上午08:50~09:00" onChange={(choice, other) => setC({ ...c, choice, other })} />
          <Field label="後面加上" hint="不需要可以清空">
            <Input name="checkinSuffix" value={c.suffix} onChange={(e) => setC({ ...c, suffix: e.target.value })} />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm">
        <div className="mb-2 text-xs text-gray-500">家長頁會顯示（在活動說明最上方）：</div>
        {preview.length ? (
          preview.map(([label, text]) => (
            <p key={label} className="font-semibold">
              {label}：{text}
            </p>
          ))
        ) : (
          <p className="text-gray-500">尚未設定</p>
        )}
      </div>

      <SubmitButton>儲存時間與地點</SubmitButton>
    </ActionForm>
  );
}
