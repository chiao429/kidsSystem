import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Permission, RoleScope } from '@kids/schema';

export interface Session {
  account: string;
  name: string;
  /** 角色ID */
  role: string;
  roleName: string;
  /** 可使用的系統（登入當下的角色設定快照） */
  permissions: Permission[];
  scope: RoleScope;
  /** 第一次登入或密碼被重設：必須先改密碼 */
  mustChangePassword: boolean;
  /** 可管理的活動ID；['*'] 表示全部 */
  events: string[];
  /** 負責的小隊（點名用），可空白 */
  team: string;
  exp: number;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function encodeSession(session: Session, secret: string): string {
  const payload = Buffer.from(JSON.stringify(session)).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function decodeSession(token: string | undefined, secret: string): Session | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  if (
    expected.length !== signature.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  ) {
    return null;
  }
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
    // 舊版 session（沒有權限資訊）視為未登入，重新登入即可
    return session.exp > Date.now() && Array.isArray(session.permissions) ? session : null;
  } catch {
    return null;
  }
}

export function canAccessEvent(session: Session, eventId: string): boolean {
  return session.scope === 'all' || session.events.includes('*') || session.events.includes(eventId);
}
