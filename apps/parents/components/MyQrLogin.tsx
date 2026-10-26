'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { familySignOut } from '@kids/registration-core/lib/actions';
import { FamilyLogin } from '@kids/registration-core/components/FamilyLogin';

/** 跨活動查詢報到 QR code：登入後重新整理頁面，由伺服器依登入的家庭列出 QR code */
export function MyQrLogin() {
  const router = useRouter();
  return <FamilyLogin onVerified={() => router.refresh()} />;
}

/** 換成另一支手機查詢 */
export function MyQrSignOut() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="rb-link text-sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await familySignOut();
          router.refresh();
        })
      }
    >
      更換登入手機
    </button>
  );
}
