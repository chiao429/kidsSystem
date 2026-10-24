import { Shell } from '@kids/ui';
import { logout, requireSession } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession({ permission: 'admin' });
  const nav = [{ href: '/', label: '活動' }, { href: '/families', label: '家庭' }];
  if (session.permissions.includes('accounts')) {
    nav.push({ href: '/accounts', label: '帳號' }, { href: '/roles', label: '角色權限' }, { href: '/setup', label: '初始化' });
  }
  return (
    <Shell title="系統管理後台" brand="#315bc7" nav={nav} user={session.name} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
