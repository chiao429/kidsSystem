'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@kids/ui';
import { lookupQr } from '@/lib/actions';
import { FamilyLogin } from './FamilyLogin';

/** 家長以手機＋PIN 登入後，找回本活動的報到 QR code（這台裝置記住的家庭可直接查） */
export function QrLookup({ eventId, remembered }: { eventId: string; remembered?: { name: string; phone: string } }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [, startTransition] = useTransition();
  const show = () =>
    startTransition(async () => {
      setError('');
      const res = await lookupQr(eventId);
      if (res.error || !res.ids) return setError(res.error ?? '查無資料');
      router.push(`/e/${eventId}/done?view=qr&ids=${res.ids.join(',')}`);
    });
  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      <FamilyLogin remembered={remembered} onVerified={show} />
    </div>
  );
}
