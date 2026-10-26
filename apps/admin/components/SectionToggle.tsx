'use client';

import { useState, useTransition } from 'react';
import { setSectionVisible } from '@/lib/event-actions';
import { Toggle } from './Toggle';

/** 報名頁內容各區塊的「在家長頁顯示」：切換後立即儲存 */
export function SectionToggle({ eventId, section, initial }: { eventId: string; section: string; initial: boolean }) {
  const [show, setShow] = useState(initial);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <Toggle
        checked={show}
        disabled={pending}
        label="在家長頁顯示"
        onChange={(v) => {
          setShow(v);
          setError('');
          startTransition(async () => {
            const res = await setSectionVisible(eventId, section, v).catch(() => ({ error: '儲存失敗，請檢查網路' }));
            if (res.error) {
              setShow(!v);
              setError(res.error);
            }
          });
        }}
      />
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
