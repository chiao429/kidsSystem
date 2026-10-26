import { notFound } from 'next/navigation';
import { Alert } from '@kids/ui';
import { RegistrationSource } from '@kids/schema';
import { RegisterForm } from '@kids/registration-core/components/RegisterForm';
import { getEvent, registrationWindow } from '@kids/registration-core/lib/events';
import { formProps } from '@kids/registration-core/lib/form-props';
import { isStaff } from '@kids/registration-core/lib/family-auth';
import { BackLink } from '@/components/BackLink';
import { GuidedTour, type TourStep } from '@kids/registration-core/components/GuidedTour';

// 初次報名的操作導覽：依表單由上到下標示；找不到的區塊（例如沒有課程可選）會自動略過
const tourSteps: TourStep[] = [
  { target: 'contact', title: '填寫家庭聯絡資料', text: '主要聯絡人與手機號碼必填。手機號碼之後就是家長登入的帳號，請填常用的號碼。' },
  { target: 'member', title: '填寫孩子的資料', text: '姓名、性別、生日、年級都要填。過敏、用藥或需要特別照顧的地方，請寫在「特殊需求」。' },
  { target: 'course', title: '幫孩子選課程', text: '選好年級後，這裡會列出適合的課程，點一下卡片就能選取。額滿的課程無法選擇。' },
  { target: 'add', title: '還有其他孩子？', text: '同一個家庭有兄弟姊妹要一起報名，按這裡再新增一位，每位都可以選自己的課程。' },
  { target: 'pin', title: '設定 4 位數 PIN', text: '下次報名或查詢報到 QR code 時，用手機＋這組 PIN 登入，就不用再填一次資料。' },
  { target: 'consent', title: '確認同意事項', text: '請閱讀並勾選同意事項，可以直接勾「以上皆同意」。' },
  { target: 'submit', title: '送出報名', text: '確認資料無誤後按「送出報名」，完成後會顯示報到 QR code，活動當天出示即可快速報到。' },
];

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
  return (
    <>
      <BackLink eventId={params.eventId} />
      <h1 className="text-xl font-bold">
        {event.名稱}｜初次報名
        {source === RegistrationSource.OnSite && <span className="ml-2 text-base text-amber-600">（現場報名）</span>}
      </h1>
      <GuidedTour steps={tourSteps} label="操作導覽" finishText="開始填寫吧！" />
      <RegisterForm
        mode="new"
        source={source}
        staff={source === RegistrationSource.OnSite && isStaff()}
        {...await formProps(event)}
      />
    </>
  );
}
