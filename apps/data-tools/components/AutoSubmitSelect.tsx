'use client';

import { useRef } from 'react';

/** 選了就送出所屬表單 */
export function AutoSubmitSelect({ name, value, options }: { name: string; value: string; options: string[] }) {
  const ref = useRef<HTMLSelectElement>(null);
  return (
    <select
      ref={ref}
      name={name}
      defaultValue={value}
      onChange={() => ref.current?.form?.requestSubmit()}
      className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs"
    >
      <option value="">（未分隊）</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}
