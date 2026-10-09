import { notFound } from 'next/navigation';
import { Alert } from '@kids/ui';
import { RegistrationSource } from '@kids/schema';
import { RegisterForm } from '@/components/RegisterForm';
import { getEvent, registrationWindow } from '@/lib/events';
import { formProps } from '@/lib/form-props';

export default async function Page({ params, searchParams }: { params: { eventId: string }; searchParams: { source?: string } }) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  const source = searchParams.source === RegistrationSource.OnSite ? RegistrationSource.OnSite : RegistrationSource.Online;
  const w = registrationWindow(event);
  if (!w.open && source !== RegistrationSource.OnSite) return <Alert tone="amber">{w.reason}</Alert>;
  return (
    <>
      <h1 className="text-xl font-bold">
        {event.名稱}｜曾經報名過
        {source === RegistrationSource.OnSite && <span className="ml-2 text-base text-amber-600">（現場報名）</span>}
      </h1>
      <RegisterForm mode="returning" source={source} {...await formProps(event)} />
    </>
  );
}
