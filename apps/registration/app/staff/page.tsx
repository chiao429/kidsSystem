import { redirect } from 'next/navigation';
import { Shell } from '@kids/ui';
import { LoginForm } from '@kids/ui/client';
import type { Permission } from '@kids/schema';
import { getSession, loginWithForm, logout, type LoginState } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function logoutAction() {
  'use server';
  logout();
}

/** 同工登入：任何有效帳號皆可，登入後回到同工入口列出可用系統 */
async function staffLogin(_: LoginState, formData: FormData) {
  'use server';
  return loginWithForm(formData, null, '/staff');
}

const SYSTEMS: { href: string; label: string; desc: string; permission: Permission; accent: string }[] = [
  { href: '/admin', label: '活動設定', desc: '新增活動、活動規則、課程、時間表、問卷與報表', permission: 'admin', accent: 'from-[#5969ed] via-[#4c7cf0] to-[#20d1d3]' },
  { href: '/data-tools', label: '分組分隊', desc: '年級分組、手足、自動分隊、Excel 匯出', permission: 'data-tools', accent: 'from-[#f08a67] via-[#f5a05f] to-[#f6cf69]' },
  { href: '/checkin', label: '報到', desc: '掃 QR / 搜尋報到、儀表板', permission: 'checkin', accent: 'from-[#20bfae] via-[#39c8c3] to-[#5b9ff2]' },
  { href: '/rollcall', label: '點名', desc: '小隊與課程依時段點名、出席統計', permission: 'rollcall', accent: 'from-[#ee6578] via-[#f17c88] to-[#f5b36e]' },
  { href: '/import', label: '匯入舊資料', desc: '從 Excel / Google Sheet 匯入舊報名表', permission: 'import', accent: 'from-[#8868dc] via-[#a276e5] to-[#dc76d8]' },
];

/** 同工入口：未登入直接顯示登入畫面；已登入依角色列出可用系統（全部用整頁導向，可跨系統） */
export default function StaffHomePage() {
  const session = getSession();
  if (!session) {
    return (
      <div style={{ ['--brand' as string]: '#315bc7' }} className="px-4">
        <LoginForm title="同工登入" action={staffLogin} />
      </div>
    );
  }
  if (session.mustChangePassword) redirect('/password');
  const list = SYSTEMS.filter((s) => session.permissions.includes(s.permission));
  return (
    <Shell title="同工入口" brand="#16a34a" staffHome={null} footerNav={[{ href: '/admin', label: '系統管理後台' }]} user={session.name} logoutAction={logoutAction}>
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="text-sm text-gray-600">
          {session.name}（{session.roleName}）已登入，以下系統可直接使用。
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          {list.map((s) => (
            <section key={s.href} className={`group relative min-h-48 overflow-hidden rounded-[28px] border border-white/30 bg-gradient-to-br ${s.accent} p-6 pb-16 text-white shadow-[0_12px_30px_rgba(35,49,75,0.12)] transition duration-500 hover:-translate-y-2 hover:rotate-[0.7deg] hover:shadow-[0_20px_38px_rgba(35,49,75,0.2)]`}>
              <h2 className="mb-2 text-xl font-extrabold tracking-tight">{s.label}</h2>
              <p className="text-sm leading-6 text-white/85">{s.desc}</p>
              <a href={s.href} aria-label={`進入${s.label}`} className="absolute bottom-5 right-6 text-4xl font-light leading-none text-white transition-transform duration-300 group-hover:translate-x-1">
                →
              </a>
            </section>
          ))}
        </div>
      </div>
    </Shell>
  );
}
