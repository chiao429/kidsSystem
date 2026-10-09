import { LoginForm } from '@kids/ui/client';
import { loginWithForm } from '@kids/auth/next';

async function login(_: { error: string }, formData: FormData) {
  'use server';
  return loginWithForm(formData, ['admin', 'manager']);
}

export default function LoginPage() {
  return (
    <div style={{ ['--brand' as string]: '#7c3aed' }} className="px-4">
      <LoginForm title="系統管理後台" action={login} />
    </div>
  );
}
