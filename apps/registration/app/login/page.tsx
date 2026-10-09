import { LoginForm } from '@kids/ui/client';
import { loginWithForm } from '@kids/auth/next';

async function login(_: { error: string }, formData: FormData) {
  'use server';
  return loginWithForm(formData, ['admin', 'manager'], '/import');
}

export default function LoginPage() {
  return (
    <div style={{ ['--brand' as string]: '#16a34a' }} className="px-4">
      <LoginForm title="報名系統（工作人員）" action={login} />
    </div>
  );
}
