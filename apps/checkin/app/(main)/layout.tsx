import { Shell } from '@kids/ui';
import { logout, requireSession } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession({ permission: 'checkin' });
  return (
    <Shell title="報到系統" brand="#315bc7" nav={[{ href: '/', label: '活動' }]} user={session.name} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
