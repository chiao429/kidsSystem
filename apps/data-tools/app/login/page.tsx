import type { Role } from '@kids/schema';
import { LoginForm } from '@kids/ui/client';
import { loginWithForm, redirectIfLoggedIn, safeNext, type LoginState } from '@kids/auth/next';

const ROLES: Role[] = ['admin', 'manager'];

async function login(_: LoginState, formData: FormData) {
  'use server';
  return loginWithForm(formData, ROLES);
}

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  const next = safeNext(searchParams.next);
  redirectIfLoggedIn(ROLES, next);
  return (
    <div style={{ ['--brand' as string]: '#0d9488' }} className="px-4">
      <LoginForm title="資料整理" action={login} next={next} />
      <p className="mt-4 text-center text-sm">
        <a href="/staff" className="text-gray-500 underline">
          同工入口
        </a>
      </p>
    </div>
  );
}
