import { Alert, BrandFooter } from '@kids/ui';
import { LoginForm } from '@kids/ui/client';
import { loginWithForm, redirectIfLoggedIn, safeNext, type LoginState } from '@kids/auth/next';

async function login(_: LoginState, formData: FormData) {
  'use server';
  return loginWithForm(formData, 'admin');
}

export default function LoginPage({ searchParams }: { searchParams: { next?: string; changed?: string } }) {
  const next = safeNext(searchParams.next);
  redirectIfLoggedIn('admin', next);
  return (
    <div style={{ ['--brand' as string]: '#7c3aed' }} className="flex min-h-screen flex-col px-4">
      {searchParams.changed && (
        <div className="mx-auto mt-6 max-w-sm">
          <Alert tone="green">密碼已更新，請用新密碼重新登入</Alert>
        </div>
      )}
      <LoginForm title="系統管理後台" action={login} next={next} />
      <BrandFooter className="mt-auto" />
    </div>
  );
}
