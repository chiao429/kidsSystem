import { Shell } from '@kids/ui';
import { logout, requireSession } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession({ permission: 'import' });
  return (
    <Shell title="報名系統｜工作人員" brand="#16a34a" nav={[{ href: '/import', label: '匯入舊資料' }]} user={session.name} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
