'use client';

import { useState } from 'react';
import { Button, Input, Select } from '@kids/ui';
import { QUESTION_TYPE_LABEL, type Question, type QuestionType } from '@kids/schema';

/** 題目編輯器：結果以 JSON 放在 hidden input（name="questions"） */
export function QuestionEditor({ initial }: { initial: Question[] }) {
  const [qs, setQs] = useState<Question[]>(initial.length ? initial : []);
  const update = (i: number, patch: Partial<Question>) => setQs((list) => list.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) =>
    setQs((list) => {
      const next = [...list];
      const j = i + d;
      if (j < 0 || j >= next.length) return list;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const add = () => setQs((list) => [...list, { id: `q${Date.now().toString(36)}`, type: 'single', title: '', options: ['', ''], required: true }]);

  return (
    <div className="space-y-3">
      <input type="hidden" name="questions" value={JSON.stringify(qs.map((q) => ({ ...q, options: q.options?.filter(Boolean) })))} />
      {qs.map((q, i) => (
        <div key={q.id} className="space-y-2 rounded-lg border border-gray-200 p-3">
          <div className="flex flex-wrap gap-2">
            <span className="pt-2 text-sm text-gray-500">{i + 1}.</span>
            <Input className="min-w-[12rem] flex-1" placeholder="題目" value={q.title} onChange={(e) => update(i, { title: e.target.value })} />
            <Select className="max-w-[9rem]" value={q.type} onChange={(e) => update(i, { type: e.target.value as QuestionType })}>
              {Object.entries(QUESTION_TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={!!q.required} onChange={(e) => update(i, { required: e.target.checked })} /> 必填
            </label>
            <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)}>↑</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)}>↓</Button>
            <Button type="button" size="sm" variant="ghost" className="text-red-600" onClick={() => setQs((list) => list.filter((_, idx) => idx !== i))}>
              刪除
            </Button>
          </div>
          {(q.type === 'single' || q.type === 'multi') && (
            <div className="space-y-1 pl-6">
              {(q.options ?? []).map((o, oi) => (
                <div key={oi} className="flex gap-2">
                  <Input
                    value={o}
                    placeholder={`選項 ${oi + 1}`}
                    onChange={(e) => update(i, { options: (q.options ?? []).map((x, xi) => (xi === oi ? e.target.value : x)) })}
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={() => update(i, { options: (q.options ?? []).filter((_, xi) => xi !== oi) })}>
                    ✕
                  </Button>
                </div>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => update(i, { options: [...(q.options ?? []), ''] })}>
                ＋ 選項
              </Button>
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={add}>
        ＋ 新增題目
      </Button>
    </div>
  );
}
