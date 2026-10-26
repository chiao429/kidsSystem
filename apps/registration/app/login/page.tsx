import { Alert, BrandFooter } from '@kids/ui';
import { LoginForm } from '@kids/ui/client';
import { loginWithForm, redirectIfLoggedIn, safeNext, type LoginState } from '@kids/auth/next';

async function login(_: LoginState, formData: FormData) {
  'use server';
  return loginWithForm(formData, 'import', '/import');
}

export default function LoginPage({ searchParams }: { searchParams: { next?: string; changed?: string } }) {
  const next = safeNext(searchParams.next);
  redirectIfLoggedIn('import', next);
  return (
    <div style={{ ['--brand' as string]: '#16a34a' }} className="flex min-h-screen flex-col px-4">
      {searchParams.changed && (
        <div className="mx-auto mt-6 max-w-sm">
          <Alert tone="green">密碼已更新，請用新密碼重新登入</Alert>
        </div>
      )}
      <LoginForm title="報名系統（工作人員）" action={login} next={next} />
      <BrandFooter className="mt-auto" />
    </div>
  );
}
