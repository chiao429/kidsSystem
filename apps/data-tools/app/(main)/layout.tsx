import { systemLinksFor } from '@kids/schema';
import { Shell } from '@kids/ui';
import { logout, requireSession } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession({ permission: 'data-tools' });
  return (
    <Shell title="資料整理" brand="#0d9488" nav={[{ href: '/', label: '活動' }]} systems={systemLinksFor(session.permissions, '/data-tools')} user={session.name} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
