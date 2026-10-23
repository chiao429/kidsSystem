'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input } from '@kids/ui';
import { lookupQr } from '@/lib/actions';

/** 家長輸入手機號碼，找回本活動的報到 QR code */
export function QrLookup({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const search = () =>
    startTransition(async () => {
      setError('');
      const res = await lookupQr(eventId, phone);
      if (res.error || !res.ids) {
        setError(res.error ?? '查無資料');
        return;
      }
      router.push(`/e/${eventId}/done?view=qr&ids=${res.ids.join(',')}`);
    });
  return (
    <Card title="查詢報到 QR code">
      <div className="space-y-3">
        {error && <Alert>{error}</Alert>}
        <Field label="報名時填寫的手機號碼" required>
          <Input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && phone && search()} />
        </Field>
        <Button onClick={search} disabled={pending || !phone}>
          {pending ? '查詢中…' : '查詢'}
        </Button>
      </div>
    </Card>
  );
}
