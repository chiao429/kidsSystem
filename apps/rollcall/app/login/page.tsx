import { LoginForm } from '@kids/ui/client';
import { loginWithForm } from '@kids/auth/next';

async function login(_: { error: string }, formData: FormData) {
  'use server';
  return loginWithForm(formData, ['admin', 'manager', 'staff']);
}

export default function LoginPage() {
  return (
    <div style={{ ['--brand' as string]: '#d97706' }} className="px-4">
      <LoginForm title="點名系統" action={login} />
    </div>
  );
}
