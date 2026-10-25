import { systemLinksFor } from '@kids/schema';
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
    <Shell title="報名系統｜工作人員" brand="#315bc7" nav={[{ href: '/import', label: '匯入舊資料' }]} systems={systemLinksFor(session.permissions, '/import')} user={session.name} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
