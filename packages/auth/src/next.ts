import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Permission } from '@kids/schema';
import { authenticate, changePassword } from './accounts';
import { canAccessEvent, decodeSession, encodeSession, type Session } from './crypto';
import { PATHNAME_HEADER, safeNext } from './paths';

export { safeNext } from './paths';

/**
 * 登入 cookie：五個系統經由統一入口共用同一個網域，cookie path 為 '/'，
 * 因此在任一系統登入即全部登入、任一系統登出即全部登出（AUTH_SECRET 必須相同）。
 */
const COOKIE = 'kids_session';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET 未設定或長度不足 16');
  return s;
}

const basePath = () => process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function getSession(): Session | null {
  return decodeSession(cookies().get(COOKIE)?.value, secret());
}

/** 目前請求的完整路徑（含 basePath 與 query），由各 app 的 middleware 寫入 */
function currentPath(): string {
  return headers().get(PATHNAME_HEADER) ?? '';
}

export interface AccessOptions {
  /** 需要的系統權限 */
  permission?: Permission;
  /** 需要「所有活動」範圍（例如新增活動） */
  allEvents?: boolean;
  eventId?: string;
}

/** 判斷 session 是否有權限（不導向） */
export function hasAccess(session: Session | null, opts: AccessOptions): boolean {
  return !!session && !check(opts, session).reason;
}

function check(
  opts: AccessOptions,
  session: Session | null = getSession(),
): { session: Session | null; reason?: 'login' | 'password' | 'role' | 'event' } {
  if (!session) return { session, reason: 'login' };
  if (session.mustChangePassword) return { session, reason: 'password' };
  if (opts.permission && !session.permissions.includes(opts.permission)) return { session, reason: 'role' };
  if (opts.allEvents && session.scope !== 'all') return { session, reason: 'role' };
  if (opts.eventId && !canAccessEvent(session, opts.eventId)) return { session, reason: 'event' };
  return { session };
}

/**
 * 頁面/Server Action 用：
 * - 未登入 → 本系統 /login?next=<目前路徑>
 * - 需要改密碼 → 本系統 /password
 * - 沒有該系統權限或沒有此活動權限 → 本系統 /forbidden?reason=role|event
 */
export function requireSession(opts: AccessOptions = {}): Session {
  const { session, reason } = check(opts);
  if (reason === 'login') {
    const next = safeNext(currentPath());
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  }
  if (reason === 'password') redirect('/password');
  if (reason) redirect(`/forbidden?reason=${reason}`);
  return session!;
}

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

/** Route Handler / API 用：不導向，丟出 AuthError（呼叫端轉成 401/403 JSON） */
export function requireSessionOrThrow(opts: AccessOptions = {}): Session {
  const { session, reason } = check(opts);
  if (reason === 'login') throw new AuthError(401, '請先登入');
  if (reason === 'password') throw new AuthError(403, '請先修改密碼');
  if (reason === 'role') throw new AuthError(403, '此帳號沒有使用本系統的權限');
  if (reason === 'event') throw new AuthError(403, '沒有此活動的權限');
  return session!;
}

/** 登入頁：已登入且有權限時直接前往 next（或本系統首頁）；需要改密碼則前往 /password */
export function redirectIfLoggedIn(permission: Permission, next?: string) {
  const session = getSession();
  if (!session) return;
  if (session.mustChangePassword) redirect('/password');
  if (!session.permissions.includes(permission)) return;
  const target = safeNext(next) || `${basePath()}/`;
  redirectAbsolute(target);
}

/**
 * 導向「含 basePath 的完整站內路徑」。next/navigation 的 redirect 會自動加上本系統 basePath，
 * 所以落在本系統的路徑先去掉 basePath；跨系統的路徑（例如從 /checkin 登入後回到 /rollcall）
 * 無法用 redirect 表達，改由登入表單在瀏覽器端導向（見 loginWithForm 的回傳值）。
 */
function redirectAbsolute(path: string): never | void {
  const bp = basePath();
  if (!bp) return redirect(path);
  if (path === bp || path.startsWith(`${bp}/`) || path.startsWith(`${bp}?`)) return redirect(path.slice(bp.length) || '/');
}

export interface LoginState {
  error: string;
  /** 登入成功後要前往的完整站內路徑（由瀏覽器導向，可跨系統） */
  redirect?: string;
}

/** 給 LoginForm 用的 Server Action 主體；表單可帶 next（登入後返回的路徑） */
export async function loginWithForm(formData: FormData, permission: Permission, redirectTo = '/'): Promise<LoginState> {
  const account = String(formData.get('account') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!account || !password) return { error: '請輸入帳號與密碼' };

  const session = await authenticate(account, password);
  if (session === 'disabled') return { error: '此帳號已停用，請聯絡系統管理員' };
  if (!session) return { error: '帳號或密碼錯誤' };
  if (!session.mustChangePassword && !session.permissions.includes(permission)) return { error: '此帳號沒有使用本系統的權限' };

  cookies().set(COOKIE, encodeSession(session, secret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(session.exp),
  });
  if (session.mustChangePassword) return { error: '', redirect: `${basePath()}/password` };
  return { error: '', redirect: safeNext(String(formData.get('next') ?? '')) || `${basePath()}${redirectTo}` };
}

/** 改密碼：成功後登出，請使用者以新密碼重新登入 */
export async function changePasswordWithForm(formData: FormData): Promise<LoginState> {
  const session = getSession();
  if (!session) return { error: '', redirect: `${basePath()}/login` };
  const current = String(formData.get('current') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  if (newPassword !== String(formData.get('confirm') ?? '')) return { error: '兩次輸入的新密碼不一致' };
  const error = await changePassword(session.account, current, newPassword);
  if (error) return { error };
  cookies().set(COOKIE, '', { path: '/', maxAge: 0 });
  redirect('/login?changed=1');
}

export function logout(): never {
  // 明確以 path '/' 刪除，任何系統登出都會清掉同一個 cookie
  cookies().set(COOKIE, '', { path: '/', maxAge: 0 });
  redirect('/login');
}
