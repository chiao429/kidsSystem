import { LoginForm } from '@kids/ui/client';
import { loginWithForm } from '@kids/auth/next';

async function login(_: { error: string }, formData: FormData) {
  'use server';
  return loginWithForm(formData, ['admin', 'manager']);
}

export default function LoginPage() {
  return (
    <div style={{ ['--brand' as string]: '#0d9488' }} className="px-4">
      <LoginForm title="資料整理" action={login} />
    </div>
  );
}
