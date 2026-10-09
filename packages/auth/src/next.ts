import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Role } from '@kids/schema';
import { authenticate } from './accounts';
import { canAccessEvent, decodeSession, encodeSession, type Session } from './crypto';

const COOKIE = 'kids_session';

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET 未設定或長度不足 16');
  return s;
}

export function getSession(): Session | null {
  return decodeSession(cookies().get(COOKIE)?.value, secret());
}

/** 頁面/Server Action 用：未登入導向 /login，角色不符或無此活動權限則拋錯 */
export function requireSession(opts: { roles?: Role[]; eventId?: string } = {}): Session {
  const session = getSession();
  if (!session) redirect('/login');
  if (opts.roles && !opts.roles.includes(session.role)) {
    throw new Error('權限不足');
  }
  if (opts.eventId && !canAccessEvent(session, opts.eventId)) {
    throw new Error('沒有此活動的權限');
  }
  return session;
}

export interface LoginState {
  error: string;
}

/** 給 LoginForm 用的 Server Action 主體 */
export async function loginWithForm(
  formData: FormData,
  allowedRoles: Role[],
): Promise<LoginState> {
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
  redirect('/');
}

export function logout(): never {
  cookies().delete(COOKIE);
  redirect('/login');
}
