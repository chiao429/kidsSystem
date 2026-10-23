import { redirect } from 'next/navigation';
import { PasswordForm } from '@kids/ui/client';
import { changePasswordWithForm, getSession, type LoginState } from '@kids/auth/next';

export const dynamic = 'force-dynamic';

async function change(_: LoginState, formData: FormData) {
  'use server';
  return changePasswordWithForm(formData);
}

export default function PasswordPage() {
  const session = getSession();
  if (!session) redirect('/login');
  return (
    <div style={{ ['--brand' as string]: '#7c3aed' }} className="px-4">
      <PasswordForm name={session.name} required={session.mustChangePassword} action={change} />
    </div>
  );
}
