import clsx from 'clsx';
import { forwardRef } from 'react';
import type {
  ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes,
} from 'react';

export { clsx as cn };

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--brand)] text-white hover:opacity-90',
  secondary: 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  ghost: 'text-gray-700 hover:bg-gray-100',
};

export function buttonClass(variant: Variant = 'primary', size: 'sm' | 'md' | 'lg' = 'md') {
  return clsx(
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
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
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={clsx(fieldClass, className)} {...props} />;
});

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(fieldClass, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={clsx(fieldClass, className)} {...props}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

export function Card({ title, actions, children, className }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx('rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-lg font-semibold">{title}</h2>}
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
  return <div className={clsx('rounded-lg px-3 py-2 text-sm', tones[tone])}>{children}</div>;
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
  user,
  logoutAction,
  staffHome = '/staff',
  children,
}: {
  title: string;
  brand: string;
  nav?: NavItem[];
  /** 跨系統的同工入口（站內絕對路徑）；傳 null 不顯示 */
  staffHome?: string | null;
  user?: string;
  logoutAction?: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div style={{ ['--brand' as string]: brand }} className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <a href={withBase('/')} className="text-lg font-bold" style={{ color: brand }}>
            {title}
          </a>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map((n) => (
              <a key={n.href} href={withBase(n.href)} className="rounded-md px-2 py-1 text-gray-700 hover:bg-gray-100">
                {n.label}
              </a>
            ))}
            {staffHome && (
              <a href={staffHome} className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100">
                同工入口
              </a>
            )}
          </nav>
          {user && (
            <form action={logoutAction} className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              <span>{user}</span>
              <button className="rounded-md px-2 py-1 hover:bg-gray-100">登出</button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">{children}</main>
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
