import { notFound } from 'next/navigation';
import { Alert } from '@kids/ui';
import { RegistrationSource } from '@kids/schema';
import { RegisterForm } from '@kids/registration-core/components/RegisterForm';
import { getEvent, registrationWindow } from '@kids/registration-core/lib/events';
import { formProps } from '@kids/registration-core/lib/form-props';
import { isStaff, maskPhone, verifiedFamilyId } from '@kids/registration-core/lib/family-auth';
import { households } from '@kids/registration-core/lib/tables';
import { BackLink } from '@/components/BackLink';
import { GuidedTour, type TourStep } from '@kids/registration-core/components/GuidedTour';

// 家長登入的操作導覽：登入前與登入後的畫面不同，找不到的區塊會自動略過
const tourSteps: TourStep[] = [
  { target: 'login-remembered', title: '這台裝置記得您的家庭', text: '確認是您的家庭就按「以這個家庭繼續報名」；不是的話按「不是我，換一支手機」。' },
  { target: 'login-phone', title: '輸入家長手機', text: '輸入初次報名時填寫的家長手機號碼。' },
  { target: 'login-pin', title: '輸入 4 位數 PIN', text: '初次報名時設定的 PIN。' },
  { target: 'login-remember', title: '記住這台裝置', text: '勾選後 90 天內不用再輸入 PIN；共用電腦請不要勾。' },
  { target: 'login-submit', title: '送出，或重設 PIN', text: '按「送出」帶入家庭資料。忘記 PIN 或還沒設定過，按「忘記 PIN／還沒設定過 PIN」，用孩子的全名＋生日驗證後重新設定。' },
  { target: 'done-card', title: '已完成報名', text: '這個家庭在本活動已經報名的孩子，可以在這裡打開報到 QR code。' },
  { target: 'contact', title: '確認家庭聯絡資料', text: '主要聯絡人與手機不能在這裡修改；Email、地址有變更可以直接修改。' },
  { target: 'member', title: '勾選這次要報名的孩子', text: '勾選要報名的孩子並確認年級；沒有勾選的不會報名。已報名的孩子會直接顯示報名內容。' },
  { target: 'course', title: '幫孩子選課程', text: '依孩子的年級列出可以選的課程，點一下卡片就能選取。' },
  { target: 'add', title: '新增家庭成員', text: '有新的孩子要一起報名，可以在這裡新增。' },
  { target: 'consent', title: '確認同意事項', text: '請閱讀並勾選同意事項，可以直接勾「以上皆同意」。' },
  { target: 'submit', title: '送出報名', text: '確認無誤後按「送出報名」，完成後會顯示報到 QR code。' },
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
      <GuidedTour steps={tourSteps} label="操作導覽" finishText="開始報名吧！" />
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
