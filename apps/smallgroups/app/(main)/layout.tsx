import { systemLinksFor } from '@kids/schema';
import { Shell, type NavItem } from '@kids/ui';
import { logout, requireSession } from '@kids/auth/next';
import { ensureSmallGroupTables } from '@/lib/tables';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = requireSession({ permission: 'smallgroups' });
  // 小組三張表第一次使用時建立（同一程序只做一次）
  await ensureSmallGroupTables();
  const nav: NavItem[] = [{ href: '/', label: '小組點名' }];
  nav.push({ href: '/report', label: 'LINE 統計' });
  if (session.permissions.includes('smallgroup-settings')) nav.push({ href: '/settings', label: '小組設定' });
  return (
    <Shell title="小組系統" brand="#0f9d77" nav={nav} systems={systemLinksFor(session.permissions, '/groups')} user={session.name} logoutAction={logoutAction}>
      {children}
    </Shell>
  );
}
