import { ForbiddenNotice } from '@kids/ui';
import { getSession, logout } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

export default function ForbiddenPage({ searchParams }: { searchParams: { reason?: string } }) {
  const session = getSession();
  return (
    <div style={{ ['--brand' as string]: '#0d9488' }} className="px-4">
      <ForbiddenNotice name={session?.name} role={session?.roleName} reason={searchParams.reason} logoutAction={logoutAction} />
    </div>
  );
}
