import { Shell } from '@kids/ui';
import { logout, requireSession } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession({ permission: 'rollcall' });
  return (
    <Shell title="點名系統" brand="#d97706" nav={[{ href: '/', label: '活動' }]} user={session.name} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
