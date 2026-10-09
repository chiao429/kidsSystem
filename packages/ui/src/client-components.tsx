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
}: {
  title: string;
  action: (state: { error: string }, formData: FormData) => Promise<{ error: string }>;
}) {
  const [state, formAction] = useFormState(action, { error: '' });
  return (
    <form action={formAction} className="mx-auto mt-16 max-w-sm space-y-4 rounded-xl border bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold">{title}</h1>
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
