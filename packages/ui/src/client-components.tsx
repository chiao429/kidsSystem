'use client';

import { useEffect } from 'react';
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
  // 登入成功：由瀏覽器整頁導向（可跨系統，例如在 /checkin 登入後回到 /rollcall）
  useEffect(() => {
    if (state.redirect) window.location.assign(state.redirect);
  }, [state.redirect]);
  return (
    <form action={formAction} className="mx-auto mt-16 max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">{title}</h1>
      {next && <input type="hidden" name="next" value={next} />}
      <Field label="帳號">
        <Input name="account" autoComplete="username" required />
      </Field>
      <Field label="密碼">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
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
