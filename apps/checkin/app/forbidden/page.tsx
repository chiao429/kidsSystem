import { ForbiddenNotice } from '@kids/ui';
import { getSession, logout } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

const roleLabel: Record<string, string> = { admin: '管理員', manager: '活動負責人', staff: '同工' };

export default function ForbiddenPage({ searchParams }: { searchParams: { reason?: string } }) {
  const session = getSession();
  return (
    <div style={{ ['--brand' as string]: '#2563eb' }} className="px-4">
      <ForbiddenNotice name={session?.name} role={session ? roleLabel[session.role] ?? session.role : undefined} reason={searchParams.reason} logoutAction={logoutAction} />
    </div>
  );
}
