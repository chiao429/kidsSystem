import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role } from '@kids/schema';
import { authenticate } from './accounts';
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

function check(opts: { roles?: Role[]; eventId?: string }): { session: Session | null; reason?: 'login' | 'role' | 'event' } {
  const session = getSession();
  if (!session) return { session, reason: 'login' };
  if (opts.roles && !opts.roles.includes(session.role)) return { session, reason: 'role' };
  if (opts.eventId && !canAccessEvent(session, opts.eventId)) return { session, reason: 'event' };
  return { session };
}

/**
 * 頁面/Server Action 用：
 * - 未登入 → 本系統 /login?next=<目前路徑>
 * - 角色不符或沒有此活動權限 → 本系統 /forbidden?reason=role|event
 */
export function requireSession(opts: { roles?: Role[]; eventId?: string } = {}): Session {
  const { session, reason } = check(opts);
  if (reason === 'login') {
    const next = safeNext(currentPath());
    redirect(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  }
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
export function requireSessionOrThrow(opts: { roles?: Role[]; eventId?: string } = {}): Session {
  const { session, reason } = check(opts);
  if (reason === 'login') throw new AuthError(401, '請先登入');
  if (reason === 'role') throw new AuthError(403, '此帳號沒有使用本系統的權限');
  if (reason === 'event') throw new AuthError(403, '沒有此活動的權限');
  return session!;
}

/** 登入頁：已登入且角色符合時直接前往 next（或本系統首頁） */
export function redirectIfLoggedIn(allowedRoles: Role[], next?: string) {
  const session = getSession();
  if (!session || !allowedRoles.includes(session.role)) return;
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
export async function loginWithForm(formData: FormData, allowedRoles: Role[], redirectTo = '/'): Promise<LoginState> {
  const account = String(formData.get('account') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!account || !password) return { error: '請輸入帳號與密碼' };

  const session = await authenticate(account, password);
  if (!session) return { error: '帳號或密碼錯誤' };
  if (!allowedRoles.includes(session.role)) return { error: '此帳號沒有使用本系統的權限' };

  cookies().set(COOKIE, encodeSession(session, secret()), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(session.exp),
  });
  return { error: '', redirect: safeNext(String(formData.get('next') ?? '')) || `${basePath()}${redirectTo}` };
}

export function logout(): never {
  // 明確以 path '/' 刪除，任何系統登出都會清掉同一個 cookie
  cookies().set(COOKIE, '', { path: '/', maxAge: 0 });
  redirect('/login');
}
