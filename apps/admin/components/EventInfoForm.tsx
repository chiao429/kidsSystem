'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, Input } from '@kids/ui';
import { saveEventInfo } from '@/lib/event-actions';
import { Toggle } from './Toggle';
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

/**
 * 報名頁內容分頁的「時間與地點」：時間（可設為連續活動）、地點、活動報到／繳費時間。
 * 修改後自動儲存，家長頁直接套用；「在家長頁顯示」關閉時家長頁不顯示活動資訊。
 */
export function EventInfoForm({
  eventId,
  time,
  venue,
  checkin,
  show: initialShow,
  neverSaved,
}: {
  eventId: string;
  time: DatedValue;
  venue: { choice: string; other: string };
  checkin: DatedValue;
  show: boolean;
  /** 這場活動還沒有設定過時間與地點：進來就把預設值存起來，家長頁直接看得到 */
  neverSaved: boolean;
}) {
  const [t, setT] = useState(time);
  const [v, setV] = useState(venue);
  const [c, setC] = useState(checkin);
  const [show, setShow] = useState(initialShow);
  const [multiDay, setMultiDay] = useState(!!time.endDate);
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'saving'; text: string } | null>(null);
  const pick = (x: { choice: string; other: string }) => (x.choice === OTHER ? x.other : x.choice);
  const endDate = multiDay ? t.endDate ?? '' : '';
  const preview = [
    ['時間', formatDated(t.date, pick(t), '', endDate)],
    ['地點', pick(v).trim()],
    ['活動報到/繳費時間', formatDated(c.date, pick(c), c.suffix)],
  ].filter(([, text]) => text);

  // 自動儲存：停止編輯 0.6 秒後送出（第一次進來只有「從未設定」時才存預設值）
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      if (!neverSaved) return;
    }
    setStatus({ tone: 'saving', text: '儲存中…' });
    const timer = setTimeout(async () => {
      const res = await saveEventInfo(eventId, {
        date: t.date,
        endDate,
        time: pick(t),
        venue: pick(v),
        checkinDate: c.date,
        checkinTime: pick(c),
        checkinSuffix: c.suffix,
        show,
      }).catch(() => ({ error: '儲存失敗，請檢查網路' }));
      setStatus(res.error ? { tone: 'error', text: res.error } : { tone: 'ok', text: '已自動儲存，家長頁已套用' });
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, v, c, show, multiDay]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Toggle checked={show} onChange={setShow} label="在家長頁顯示" />
        <Toggle checked={multiDay} onChange={setMultiDay} label="連續活動（起訖日期）" />
        {status && (
          <span className={`text-sm ${status.tone === 'error' ? 'text-red-600' : status.tone === 'saving' ? 'text-gray-400' : 'text-emerald-700'}`}>{status.text}</span>
        )}
      </div>

      <div className={`space-y-5 ${show ? '' : 'opacity-50'}`}>
        <div className={`grid gap-3 sm:items-start ${multiDay ? 'sm:grid-cols-[12rem_12rem_1fr]' : 'sm:grid-cols-[12rem_1fr]'}`}>
          <Field label={multiDay ? '開始日期' : '活動日期'}>
            <Input type="date" value={t.date} onChange={(e) => setT({ ...t, date: e.target.value })} />
          </Field>
          {multiDay && (
            <Field label="結束日期">
              <Input type="date" min={t.date} value={t.endDate ?? ''} onChange={(e) => setT({ ...t, endDate: e.target.value })} />
            </Field>
          )}
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
            <Input type="date" value={c.date} onChange={(e) => setC({ ...c, date: e.target.value })} />
          </Field>
          <div className="space-y-2">
            <span className="text-sm font-semibold text-[#4b5565]">活動報到/繳費時間</span>
            <Choices name="checkinTime" otherName="checkinTimeOther" presets={CHECKIN_PRESETS} value={c.choice} other={c.other} placeholder="例如：上午08:50~09:00" onChange={(choice, other) => setC({ ...c, choice, other })} />
            <Field label="後面加上" hint="不需要可以清空">
              <Input value={c.suffix} onChange={(e) => setC({ ...c, suffix: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-sm">
          <div className="mb-2 text-xs text-gray-500">{show ? '家長頁會顯示（活動資訊）：' : '目前不在家長頁顯示（開啟「在家長頁顯示」後會顯示）：'}</div>
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
      </div>
    </div>
  );
}
