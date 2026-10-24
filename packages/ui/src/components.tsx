import clsx from 'clsx';
import { forwardRef } from 'react';
import type {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react';

export { clsx as cn };

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const variants: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-[#315bc7] to-[#4777e8] text-white shadow-[0_6px_14px_rgba(49,91,199,0.2)] hover:brightness-95',
  secondary: 'border border-[#e2e5ea] bg-white text-[#273142] shadow-sm hover:bg-[#f8f9fb]',
  danger: 'bg-[#d94b5b] text-white shadow-sm hover:brightness-95',
  success: 'bg-[#2d9b72] text-white shadow-sm hover:brightness-95',
  ghost: 'text-[#4b5565] hover:bg-[#eef1f6]',
};

/**
 * 元件都帶有 ui-* 掛鉤 class（不影響預設外觀），讓個別 app 能在特定版面下用 CSS 換主題（例如 registration 的 .theme-shop）。
 */
export function buttonClass(variant: Variant = 'primary', size: 'sm' | 'md' | 'lg' = 'md') {
  return clsx(
    `ui-btn ui-btn-${variant}`,
    'inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
    size === 'sm' && 'px-2.5 py-1 text-sm',
    size === 'md' && 'px-4 py-2',
    size === 'lg' && 'px-5 py-3 text-lg',
    variants[variant],
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  return <button className={clsx(buttonClass(variant, size), className)} {...props} />;
}

const fieldClass =
  'w-full rounded-2xl border border-transparent bg-[#f1f2f4] px-4 py-3 text-[#273142] placeholder:text-[#969daa] focus:border-[var(--brand)] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[var(--brand)]/10';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={clsx('ui-input', fieldClass, className)} {...props} />;
});

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx('ui-textarea', fieldClass, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx('ui-input', fieldClass, className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="ui-label text-sm font-semibold text-[#4b5565]">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="ui-hint block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('ui-card rounded-[22px] border border-white/80 bg-white p-5 shadow-[0_8px_24px_rgba(35,49,75,0.06)] sm:p-6', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="ui-card-title text-lg font-bold tracking-tight text-[#1f2937]">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const tones = {
  gray: 'bg-gray-100 text-gray-700',
  green: 'bg-emerald-100 text-emerald-800',
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-800',
  blue: 'bg-blue-100 text-blue-800',
  purple: 'bg-purple-100 text-purple-800',
};

export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={clsx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Stat({ label, value, sub, tone = 'gray' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: keyof typeof tones }) {
  return (
    <div className={clsx('rounded-xl p-4', tones[tone])}>
      <div className="text-sm opacity-80">{label}</div>
      <div className="text-3xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs opacity-70">{sub}</div>}
    </div>
  );
}

export function Alert({ tone = 'red', children }: { tone?: 'red' | 'green' | 'amber' | 'blue'; children: ReactNode }) {
  return <div className={clsx(`ui-alert ui-alert-${tone} rounded-2xl px-4 py-3 text-sm`, tones[tone])}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-gray-500">{children}</p>;
}

export interface NavItem {
  href: string;
  label: string;
}

/** 本系統的 basePath（統一入口下各系統的路徑前綴；由各 app 的 next.config.js 設定） */
export const basePath = () => process.env.NEXT_PUBLIC_BASE_PATH ?? '';

/** 原生 <a>、fetch、window.location 不會自動加 basePath，用這個補上；<Link>／redirect 不需要 */
export const withBase = (path: string) => `${basePath()}${path}`;

/** 系統共用外框；brand 為該系統主色（CSS 色碼） */
export function Shell({
  title,
  brand,
  nav = [],
  footerNav = [],
  user,
  logoutAction,
  staffHome = '/staff',
  children,
}: {
  title: string;
  brand: string;
  nav?: NavItem[];
  /** 顯示在左側選單底部的入口 */
  footerNav?: NavItem[];
  /** 跨系統的同工入口（站內絕對路徑）；傳 null 不顯示 */
  staffHome?: string | null;
  user?: string;
  logoutAction?: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div style={{ ['--brand' as string]: brand }} className="min-h-screen bg-[#f1f3f7] lg:flex">
      <aside className="hidden w-64 shrink-0 flex-col bg-gradient-to-b from-[#5969ed] via-[#4c7cf0] to-[#20d1d3] px-5 py-6 text-white lg:flex">
        <a href={withBase('/')} className="mb-8 text-xl font-extrabold tracking-tight text-white">
          {title}
        </a>
        {user && (
          <div className="mb-6 flex items-center gap-3 rounded-2xl bg-white/15 px-3 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-sm font-bold text-[#315bc7]">{user.slice(0, 1)}</span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user}</div>
              <div className="text-xs text-white/70">目前登入</div>
            </div>
          </div>
        )}
        <nav className="flex flex-1 flex-col gap-1.5 text-sm">
          {nav.map((n) => (
            <a key={n.href} href={withBase(n.href)} className="rounded-xl px-4 py-3 font-medium text-white/85 transition hover:bg-white/15 hover:text-white">
              {n.label}
            </a>
          ))}
          {staffHome && (
            <a href={staffHome} className="rounded-xl px-4 py-3 font-medium text-white/75 transition hover:bg-white/15 hover:text-white">
              同工入口
            </a>
          )}
        </nav>
        {footerNav.length > 0 && (
          <nav className="mt-6 border-t border-white/20 pt-4 text-sm">
            {footerNav.map((n) => (
              <a key={n.href} href={withBase(n.href)} className="block rounded-xl px-4 py-2 font-medium text-white/80 transition hover:bg-white/15 hover:text-white">
                {n.label}
              </a>
            ))}
          </nav>
        )}
        {user && (
          <div className={footerNav.length > 0 ? 'mt-2' : 'mt-6 border-t border-white/20 pt-4'}>
            <a href={withBase('/password')} className="block rounded-xl px-4 py-2 text-sm text-white/80 hover:bg-white/15 hover:text-white">改密碼</a>
            <form action={logoutAction}>
              <button className="w-full rounded-xl px-4 py-2 text-left text-sm text-white/80 hover:bg-white/15 hover:text-white">登出</button>
            </form>
          </div>
        )}
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 bg-[#17294d] text-white shadow-sm">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-4 sm:px-6">
            <a href={withBase('/')} className="text-lg font-extrabold tracking-tight lg:hidden">{title}</a>
            <nav className="order-3 flex w-full gap-1 overflow-x-auto pb-0.5 text-sm lg:hidden">
              {nav.map((n) => (
                <a key={n.href} href={withBase(n.href)} className="shrink-0 rounded-full px-3 py-1.5 text-white/80 hover:bg-white/15 hover:text-white">{n.label}</a>
              ))}
              {staffHome && <a href={staffHome} className="shrink-0 rounded-full px-3 py-1.5 text-white/70 hover:bg-white/15">同工入口</a>}
            </nav>
            {user && (
              <form action={logoutAction} className="ml-auto hidden items-center gap-2 text-sm text-white/75 lg:flex">
                <span>{user}</span>
                <a href={withBase('/password')} className="rounded-full px-3 py-1.5 hover:bg-white/15">改密碼</a>
                <button className="rounded-full px-3 py-1.5 hover:bg-white/15">登出</button>
              </form>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-7xl space-y-5 px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 text-gray-500">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="whitespace-nowrap px-2 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

/** 帳號沒有權限時的說明（各系統的 /forbidden 頁使用） */
export function ForbiddenNotice({
  name,
  role,
  reason,
  logoutAction,
}: {
  name?: string;
  role?: string;
  reason?: string;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="mx-auto mt-16 max-w-md space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">沒有權限</h1>
      <p className="text-sm text-gray-700">
        {name ? `目前登入的帳號（${name}${role ? `，${role}` : ''}）` : '目前的帳號'}
        {reason === 'event' ? '沒有此活動的權限。' : '沒有使用本系統的權限。'}
      </p>
      <div className="flex gap-2">
        <a href="/staff" className={buttonClass('secondary')}>
          回同工入口
        </a>
        <form action={logoutAction}>
          <Button>登出並換帳號</Button>
        </form>
      </div>
    </div>
  );
}
