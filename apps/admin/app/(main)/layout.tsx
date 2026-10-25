import { systemLinksFor, type Permission } from '@kids/schema';
import { Shell, type NavItem } from '@kids/ui';
import { logout, requireSession } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession({ permission: 'admin' });
  const can = (p: Permission) => session.permissions.includes(p);
  // 選單只顯示角色有勾選的項目（活動＝進入後台，一定有）
  const nav: NavItem[] = [{ href: '/', label: '活動' }];
  if (can('families')) nav.push({ href: '/families', label: '家庭' });
  const settings: NavItem[] = (
    [
      ['signatures', '/signatures', '簽名檔'],
      ['accounts', '/accounts', '帳號'],
      ['roles', '/roles', '角色權限'],
      ['setup', '/setup', '初始化'],
    ] as const
  )
    .filter(([p]) => can(p))
    .map(([, href, label]) => ({ href, label }));
  if (settings.length) nav.push({ href: '', label: '系統設定', children: settings });
  return (
    <Shell title="系統管理後台" brand="#315bc7" nav={nav} systems={systemLinksFor(session.permissions, '/admin')} user={session.name} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
