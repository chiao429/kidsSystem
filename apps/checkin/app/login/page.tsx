import { LoginForm } from '@kids/ui/client';
import { loginWithForm } from '@kids/auth/next';

async function login(_: { error: string }, formData: FormData) {
  'use server';
  return loginWithForm(formData, ['admin', 'manager', 'staff']);
}

export default function LoginPage() {
  return (
    <div style={{ ['--brand' as string]: '#2563eb' }} className="px-4">
      <LoginForm title="報到系統" action={login} />
    </div>
  );
}
