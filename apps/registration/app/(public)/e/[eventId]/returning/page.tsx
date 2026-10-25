import { notFound } from 'next/navigation';
import { Alert } from '@kids/ui';
import { RegistrationSource } from '@kids/schema';
import { RegisterForm } from '@/components/RegisterForm';
import { getEvent, registrationWindow } from '@/lib/events';
import { formProps } from '@/lib/form-props';
import { isStaff, maskPhone, verifiedFamilyId } from '@/lib/family-auth';
import { households } from '@/lib/tables';
import { BackLink } from '@/components/BackLink';

export default async function Page({ params, searchParams }: { params: { eventId: string }; searchParams: { source?: string } }) {
  const event = await getEvent(params.eventId);
  if (!event) notFound();
  const source = searchParams.source === RegistrationSource.OnSite ? RegistrationSource.OnSite : RegistrationSource.Online;
  const w = registrationWindow(event);
  if (!w.open && source !== RegistrationSource.OnSite) return (
      <>
        <BackLink eventId={params.eventId} />
        <Alert tone="amber">{w.reason}</Alert>
      </>
    );
  // 同工現場報名才可直接用手機查詢；家長端要 PIN，這台裝置記住的家庭可直接繼續
  const staff = source === RegistrationSource.OnSite && isStaff();
  const familyId = staff ? null : verifiedFamilyId();
  const family = familyId ? (await households().all()).find((h) => h.家庭ID === familyId) : undefined;
  return (
    <>
      <BackLink eventId={params.eventId} />
      <h1 className="text-xl font-bold">
        {event.名稱}｜家長登入
        {source === RegistrationSource.OnSite && <span className="ml-2 text-base text-amber-600">（現場報名）</span>}
      </h1>
      <RegisterForm
        mode="returning"
        source={source}
        staff={staff}
        remembered={family ? { name: family.主要聯絡人, phone: maskPhone(family.電話) } : undefined}
        {...await formProps(event)}
      />
    </>
  );
}
