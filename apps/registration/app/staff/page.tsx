import { Card, Shell, buttonClass } from '@kids/ui';
import type { Permission } from '@kids/schema';
import { getSession, logout } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

const SYSTEMS: { href: string; label: string; desc: string; permission: Permission }[] = [
  { href: '/admin', label: '系統管理後台', desc: '活動、分組、報名狀態、時間表、問卷、報表', permission: 'admin' },
  { href: '/data-tools', label: '分組分隊', desc: '年級分組、手足、自動分隊、Excel 匯出', permission: 'data-tools' },
  { href: '/checkin', label: '報到', desc: '掃 QR / 搜尋報到、儀表板', permission: 'checkin' },
  { href: '/rollcall', label: '點名', desc: '小隊與課程依時段點名、出席統計', permission: 'rollcall' },
  { href: '/import', label: '匯入舊資料', desc: '從 Excel / Google Sheet 匯入舊報名表', permission: 'import' },
];

/** 同工入口：未登入列出各系統登入頁；已登入依角色列出可用系統（全部用整頁導向，可跨系統） */
export default function StaffHomePage() {
  const session = getSession();
  const list = session ? SYSTEMS.filter((s) => session.permissions.includes(s.permission)) : SYSTEMS.filter((s) => s.href !== '/import');
  return (
    <Shell title="同工入口" brand="#16a34a" staffHome={null} user={session?.name} logoutAction={session ? logoutAction : undefined}>
      <div className="mx-auto max-w-2xl space-y-4">
        {session && (
          <p className="text-sm text-gray-600">
            {session.name}（{session.roleName}）已登入，以下系統可直接使用。
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((s) => (
            <Card key={s.href} title={s.label}>
              <p className="mb-3 text-sm text-gray-600">{s.desc}</p>
              <a href={session ? s.href : `${s.href}/login`} className={buttonClass(session ? 'primary' : 'secondary')}>
                {session ? '進入' : '登入'}
              </a>
            </Card>
          ))}
        </div>
      </div>
    </Shell>
  );
}
