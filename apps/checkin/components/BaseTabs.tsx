'use client';

import { useEffect, useState } from 'react';
import { BASES, type BaseName } from '@kids/schema';
import type { BoardRow } from '@/lib/types';

export type BaseFilter = BaseName | '';

/** 基地切換（全部／思麥特／夢夢），各自顯示已到人數；選擇會記在這台裝置 */
export function useBaseFilter(eventId: string) {
  const key = `base:${eventId}`;
  const [base, setBase] = useState<BaseFilter>('');
  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v && BASES.some((b) => b.short === v)) setBase(v as BaseName);
    } catch {
      /* 無痕模式等情況讀不到就用全部 */
    }
  }, [key]);
  const choose = (v: BaseFilter) => {
    setBase(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* ignore */
    }
  };
  return [base, choose] as const;
}

export function BaseTabs({ rows, value, onChange }: { rows: BoardRow[]; value: BaseFilter; onChange: (v: BaseFilter) => void }) {
  const tabs: { v: BaseFilter; label: string; note?: string }[] = [{ v: '', label: '全部' }, ...BASES.map((b) => ({ v: b.short, label: b.short, note: b.note }))];
  return (
    <div role="tablist" aria-label="基地" className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const list = t.v ? rows.filter((r) => r.基地 === t.v) : rows;
        const arrived = list.filter((r) => r.報到狀態 === '已到').length;
        const on = value === t.v;
        return (
          <button
            key={t.label}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.v)}
            className={`rounded-2xl border px-4 py-2 text-left transition ${on ? 'border-[#315bc7] bg-[#315bc7] text-white' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            <div className="text-sm font-bold">
              {t.label}
              {t.note && <span className={`ml-1 text-xs font-normal ${on ? 'text-white/75' : 'text-gray-400'}`}>{t.note}</span>}
            </div>
            <div className="text-xs tabular-nums">
              已到 {arrived} / {list.length}
            </div>
          </button>
        );
      })}
    </div>
  );
}
