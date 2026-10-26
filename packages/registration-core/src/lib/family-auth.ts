import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { hashPassword, verifyPassword } from '@kids/auth';
import { getSession } from '@kids/auth/next';
import { normalizePhone, nowString } from '@kids/schema';
import { households, members } from './tables';

/**
 * 家長端「簡單註冊」：手機＋4 位數 PIN。
 * 忘記 PIN 用孩子的全名＋生日驗證。驗證通過後發一個簽章 cookie（kids_family），之後查詢家庭資料、以「家長登入」送出報名都只認這個 cookie，
 * 不再只憑手機號碼就能看到或代替別人的家庭報名。
 */
const FAMILY_COOKIE = 'kids_family';
/** 用孩子姓名與生日驗證後、設定新 PIN 前的短期憑證 */
const SETUP_COOKIE = 'kids_family_setup';
const REMEMBER_DAYS = 90;
const SESSION_HOURS = 12;
const SETUP_MINUTES = 10;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);
export const hashPin = (pin: string) => hashPassword(pin);

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) throw new Error('AUTH_SECRET 未設定或長度不足 16');
  // 與同工登入 cookie 用不同的用途字串，兩種 token 不能互相冒用
  return `${s}:family`;
}

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

function encode(data: { h: string; exp: number; k: string }): string {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function decode(token: string | undefined, kind: string): string | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { h: string; exp: number; k: string };
    return data.k === kind && data.exp > Date.now() && data.h ? data.h : null;
  } catch {
    return null;
  }
}

const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };

/** 已驗證的家庭ID（沒有或過期為 null） */
export function verifiedFamilyId(): string | null {
  return decode(cookies().get(FAMILY_COOKIE)?.value, 'family');
}

/** remember：記住這台裝置 90 天；否則關閉瀏覽器即失效（最長 12 小時） */
export function signInFamily(家庭ID: string, remember: boolean) {
  const exp = Date.now() + (remember ? REMEMBER_DAYS * 86400_000 : SESSION_HOURS * 3600_000);
  cookies().set(FAMILY_COOKIE, encode({ h: 家庭ID, exp, k: 'family' }), { ...cookieOptions, ...(remember ? { expires: new Date(exp) } : {}) });
}

export function signOutFamily() {
  cookies().set(FAMILY_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  cookies().set(SETUP_COOKIE, '', { ...cookieOptions, maxAge: 0 });
}

function startPinSetup(家庭ID: string) {
  const exp = Date.now() + SETUP_MINUTES * 60_000;
  cookies().set(SETUP_COOKIE, encode({ h: 家庭ID, exp, k: 'setup' }), { ...cookieOptions, expires: new Date(exp) });
}

function pinSetupFamilyId(): string | null {
  return decode(cookies().get(SETUP_COOKIE)?.value, 'setup');
}

/** 現場報名：已登入且有報到或後台權限的同工可直接以手機查詢，不需家長 PIN */
export function isStaff(): boolean {
  const session = getSession();
  return !!session && !session.mustChangePassword && (session.permissions.includes('checkin') || session.permissions.includes('admin'));
}

/** 目前登入同工的名稱（記錄收款人等）；沒有登入時為空白 */
export function currentStaffName(): string {
  return isStaff() ? getSession()?.name ?? '' : '';
}

export async function findHousehold(phone: string) {
  const p = normalizePhone(phone);
  if (!p) return null;
  return (await households().all({ fresh: true })).find((h) => normalizePhone(h.電話) === p) ?? null;
}

type Household = NonNullable<Awaited<ReturnType<typeof findHousehold>>>;

const lockedMinutes = (h: Household) => {
  const until = h.PIN鎖定至 ? new Date(h.PIN鎖定至).getTime() : 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 60_000) : 0;
};

/** 記一次失敗；滿 5 次鎖定 15 分鐘。回傳給家長看的訊息 */
async function recordFailure(h: Household, what: string): Promise<string> {
  const fails = (Number(h.PIN錯誤次數) || 0) + 1;
  await households().ensure();
  if (fails >= MAX_FAILS) {
    await households().updateByIds([
      { id: h.家庭ID, changes: { PIN錯誤次數: '0', PIN鎖定至: new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString(), 更新時間: nowString() } },
    ]);
    return `${what}錯誤太多次，請 ${LOCK_MINUTES} 分鐘後再試，或聯絡主辦單位協助`;
  }
  await households().updateByIds([{ id: h.家庭ID, changes: { PIN錯誤次數: String(fails) } }]);
  return `${what}不正確，還可以再試 ${MAX_FAILS - fails} 次`;
}

async function clearFailures(h: Household, changes: Record<string, string> = {}) {
  await households().ensure();
  await households().updateByIds([{ id: h.家庭ID, changes: { PIN錯誤次數: '0', PIN鎖定至: '', ...changes } }]);
}

export type FamilyAuthResult = { ok: true } | { ok?: false; error: string; needsSetup?: boolean };

const NOT_FOUND = '找不到這支手機的報名資料，請確認號碼，或改用「初次報名」';

export async function loginWithPin(phone: string, pin: string, remember: boolean): Promise<FamilyAuthResult> {
  const h = await findHousehold(phone);
  if (!h) return { error: NOT_FOUND };
  const locked = lockedMinutes(h);
  if (locked) return { error: `錯誤次數太多，請 ${locked} 分鐘後再試` };
  // 舊資料或被後台重設的家庭還沒有 PIN：先用孩子的姓名與生日驗證
  if (!h.PIN雜湊) return { error: '這個家庭還沒有設定 PIN，請先用孩子的姓名與生日驗證，再設定 PIN', needsSetup: true };
  if (!isValidPin(pin) || !verifyPassword(pin, h.PIN雜湊)) return { error: await recordFailure(h, 'PIN ') };
  await clearFailures(h);
  signInFamily(h.家庭ID, remember);
  return { ok: true };
}

/** 生日寫法不一（2019-05-03、2019/5/3、108/5/3 不處理），統一成 YYYY-MM-DD 比對 */
function normalizeDate(v: string): string {
  const m = v.trim().match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

/**
 * 忘記 PIN／尚未設定 PIN：輸入任一位孩子的全名與生日。
 * 有登記生日的孩子必須兩者都對；舊資料沒有登記生日時，全名正確即可，並把輸入的生日補進資料。
 */
export async function verifyByChild(phone: string, name: string, birthday: string): Promise<FamilyAuthResult> {
  const h = await findHousehold(phone);
  if (!h) return { error: NOT_FOUND };
  const locked = lockedMinutes(h);
  if (locked) return { error: `錯誤次數太多，請 ${locked} 分鐘後再試` };
  const date = normalizeDate(birthday);
  if (!name.trim() || !date) return { error: '請輸入孩子的全名與生日' };
  const child = (await members().all({ fresh: true })).find((m) => m.家庭ID === h.家庭ID && m.姓名.trim() === name.trim());
  const recorded = child ? normalizeDate(child.生日) : '';
  if (!child || (recorded && recorded !== date)) return { error: await recordFailure(h, '孩子的姓名或生日') };
  if (!recorded) await members().updateByIds([{ id: child.成員ID, changes: { 生日: date, 更新時間: nowString() } }]);
  await clearFailures(h);
  startPinSetup(h.家庭ID);
  return { ok: true };
}

export async function setPinAfterVerify(pin: string, confirm: string, remember: boolean): Promise<FamilyAuthResult> {
  const 家庭ID = pinSetupFamilyId();
  if (!家庭ID) return { error: '驗證已逾時，請重新驗證孩子的姓名與生日' };
  if (!isValidPin(pin)) return { error: 'PIN 必須是 4 位數字' };
  if (pin !== confirm) return { error: '兩次輸入的 PIN 不一致' };
  await households().ensure();
  await households().updateByIds([{ id: 家庭ID, changes: { PIN雜湊: hashPin(pin), PIN錯誤次數: '0', PIN鎖定至: '', 更新時間: nowString() } }]);
  cookies().set(SETUP_COOKIE, '', { ...cookieOptions, maxAge: 0 });
  signInFamily(家庭ID, remember);
  return { ok: true };
}

/**
 * 「家長登入」要用的家庭：家長以 PIN 驗證過的家庭；或同工現場以手機查詢。
 * 兩者都不是就回 null（呼叫端回傳需要登入的錯誤）。
 */
export async function resolveReturningFamily(staffPhone?: string) {
  const id = verifiedFamilyId();
  if (id) return (await households().all({ fresh: true })).find((h) => h.家庭ID === id) ?? null;
  if (staffPhone && isStaff()) return findHousehold(staffPhone);
  return null;
}

/** 顯示用：0912-345-678 → 0912-***-678 */
export const maskPhone = (phone: string) => {
  const p = normalizePhone(phone);
  return p.length === 10 ? `${p.slice(0, 4)}-***-${p.slice(7)}` : '***';
};
