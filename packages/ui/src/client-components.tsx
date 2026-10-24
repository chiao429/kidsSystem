'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Alert, Button, Field, Input } from './components';

export function SubmitButton({ children, pendingText = '處理中…', ...props }: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}

const REMEMBER_KEY = 'kids_remember_account';

function readRememberedAccount(): string {
  try {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeRememberedAccount(account: string) {
  try {
    if (account) localStorage.setItem(REMEMBER_KEY, account);
    else localStorage.removeItem(REMEMBER_KEY);
  } catch {
    // 無痕模式或封鎖儲存空間：略過
  }
}

/** Chrome / Edge 支援 PasswordCredential；Safari、Firefox 依表單欄位自動偵測 */
async function storeCredential(form: HTMLFormElement | null) {
  const w = window as unknown as { PasswordCredential?: new (form: HTMLFormElement) => Credential };
  if (!form || !w.PasswordCredential || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new w.PasswordCredential(form));
  } catch {
    // 使用者拒絕或瀏覽器不支援：略過
  }
}

export function LoginForm({
  title,
  action,
  next,
}: {
  title: string;
  action: (state: { error: string; redirect?: string }, formData: FormData) => Promise<{ error: string; redirect?: string }>;
  /** 登入後返回的站內路徑 */
  next?: string;
}) {
  const [state, formAction] = useFormState(action, { error: '' });
  const formRef = useRef<HTMLFormElement>(null);
  const accountRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [remember, setRemember] = useState(false);

  // 記住帳號：存在本機瀏覽器（各系統同網域共用），只存帳號不存密碼
  useEffect(() => {
    const saved = readRememberedAccount();
    if (saved && accountRef.current) {
      accountRef.current.value = saved;
      setRemember(true);
      passwordRef.current?.focus();
    }
  }, []);

  // 登入成功：由瀏覽器整頁導向（可跨系統，例如在 /checkin 登入後回到 /rollcall）
  useEffect(() => {
    if (!state.redirect) return;
    const redirect = state.redirect;
    const account = accountRef.current?.value.trim() ?? '';
    writeRememberedAccount(remember ? account : '');
    // 表單由 Server Action 送出、不是傳統整頁 POST，主動交給瀏覽器的密碼管理員（支援的瀏覽器才有）
    storeCredential(formRef.current).finally(() => window.location.assign(redirect));
  }, [state.redirect, remember]);

  return (
    <form ref={formRef} action={formAction} className="mx-auto mt-16 max-w-sm space-y-5 rounded-[22px] border border-white/80 bg-white p-6 shadow-[0_8px_24px_rgba(35,49,75,0.06)]">
      <h1 className="text-xl font-bold">{title}</h1>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="帳號">
        <Input ref={accountRef} id="account" name="account" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </Field>
      <Field label="密碼">
        <Input ref={passwordRef} id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-600">
        <input type="checkbox" name="rememberAccount" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        記住帳號
      </label>
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton className="w-full">登入</SubmitButton>
    </form>
  );
}

/** 每 intervalMs 重新整理 Server Component 資料 */
export function AutoRefresh({ intervalMs = 15_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [router, intervalMs]);
  return null;
}

export interface FormResult {
  error?: string;
  message?: string;
}

/** 表單送出後在原地顯示錯誤/成功訊息，輸入內容不會被清掉 */
export function ActionForm({
  action,
  children,
  className,
  id,
}: {
  action: (state: FormResult, formData: FormData) => Promise<FormResult>;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const [state, formAction] = useFormState(action, {});
  return (
    <form action={formAction} className={className} id={id}>
      {children}
      {(state.error || state.message) && (
        <div className="col-span-full">
          <Alert tone={state.error ? 'red' : 'green'}>{state.error ?? state.message}</Alert>
        </div>
      )}
    </form>
  );
}

/** 修改密碼（第一次登入或密碼被重設時必填）；成功後由瀏覽器導回登入頁 */
export function PasswordForm({
  name,
  required,
  action,
}: {
  name: string;
  required: boolean;
  action: (state: { error: string; redirect?: string }, formData: FormData) => Promise<{ error: string; redirect?: string }>;
}) {
  const [state, formAction] = useFormState(action, { error: '' });
  useEffect(() => {
    if (state.redirect) window.location.assign(state.redirect);
  }, [state.redirect]);
  return (
    <form action={formAction} className="mx-auto mt-16 max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">設定新密碼</h1>
      <p className="text-sm text-gray-600">
        {name}，{required ? '第一次登入（或密碼已被重設）請先設定新密碼，完成後請用新密碼重新登入。' : '設定新密碼後需要重新登入。'}
      </p>
      <Field label={required ? '目前密碼（預設為手機號碼）' : '目前密碼'}>
        <Input name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="新密碼（至少 8 碼）">
        <Input name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      <Field label="再輸入一次新密碼">
        <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </Field>
      {state.error && <Alert>{state.error}</Alert>}
      <SubmitButton className="w-full">更新密碼</SubmitButton>
    </form>
  );
}
