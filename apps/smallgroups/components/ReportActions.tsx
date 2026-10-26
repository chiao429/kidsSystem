'use client';

import { useState, useTransition } from 'react';
import { Alert, Button } from '@kids/ui';
import { pushReportNow } from '@/lib/actions';

/** 統計的「複製文字」「立即推送到 LINE」 */
export function ReportActions({ date, text, canPush }: { date: string; text: string; canPush: boolean }) {
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setMsg({ tone: 'green', text: '已複製' });
            } catch {
              setMsg({ tone: 'red', text: '無法複製，請手動選取文字' });
            }
          }}
        >
          複製文字
        </Button>
        {canPush && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await pushReportNow(date);
                setMsg(res.error ? { tone: 'red', text: res.error } : { tone: 'green', text: res.message ?? '已推送' });
              })
            }
          >
            {pending ? '推送中…' : '立即推送到 LINE'}
          </Button>
        )}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
