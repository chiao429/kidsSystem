'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button } from '@kids/ui';

/** 直接刪除（無法復原）的按鈕：頁面內確認視窗（瀏覽器的 confirm() 在部分環境不支援）；刪除後可轉到指定頁面 */
export function DeleteButton({
  title,
  description,
  action,
  redirectTo,
}: {
  title: string;
  description: string;
  action: () => Promise<{ error?: string }>;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const run = () =>
    startTransition(async () => {
      const res = await action();
      if (res.error) return setError(res.error);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        className="text-red-600"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        刪除
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 text-left shadow-xl">
            <p className="text-lg font-bold">{title}</p>
            <p className="mt-2 text-sm font-normal text-gray-600">{description}</p>
            {error && (
              <div className="mt-3 text-sm font-normal">
                <Alert>{error}</Alert>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" autoFocus onClick={() => setOpen(false)}>
                返回
              </Button>
              <Button variant="danger" onClick={run} disabled={pending}>
                {pending ? '刪除中…' : '確認刪除'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
