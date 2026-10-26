'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input, Select, Textarea, buttonClass } from '@kids/ui';
import { gradeRank } from '@kids/schema';
import { changeCourses, familySignOut, lookupHousehold, submitRegistration } from '../lib/actions';
import { FamilyLogin } from './FamilyLogin';
import { groupColor } from '../lib/course-colors';
import type { CourseOption, HouseholdInput, MemberInput } from '../lib/types';

/** 課程是否適合此年級 */
const fitsGrade = (c: CourseOption, grade: string) =>
  !!grade && (!c.minGrade || gradeRank(grade) >= gradeRank(c.minGrade)) && (!c.maxGrade || gradeRank(grade) <= gradeRank(c.maxGrade));

/** 兒童生日檢查：必填、需年滿 3.5 歲（伺服器送出時會再檢查一次）；回傳錯誤訊息，空字串表示通過 */
function birthdayProblem(m: MemberInput): string {
  if (m.類型 !== '兒童') return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.生日)) return '請填寫生日';
  const [y, mo, d] = m.生日.split('-').map(Number);
  return new Date(y, mo - 1 + 42, d) > new Date() ? '需年滿 3.5 歲才能報名' : '';
}

const emptyMember = (類型: string): MemberInput => ({
  姓名: '',
  性別: '',
  生日: '',
  年級: '',
  學校: '',
  類型,
  特殊需求: '',
  courses: [],
  selected: true,
});

export function RegisterForm({
  eventId,
  mode,
  source,
  grades,
  courses,
  defaultType,
  maxCoursesPerMember,
  allowOnSiteCourseRegistration,
  allowCourseChange,
  staff = false,
  onsite = false,
  initialPhone = '',
  remembered,
}: {
  eventId: string;
  mode: 'new' | 'returning';
  source: string;
  grades: string[];
  courses: CourseOption[];
  defaultType: string;
  maxCoursesPerMember: number;
  allowOnSiteCourseRegistration: boolean;
  /** 家長報名後可自行修改課程；不可修改時送出前會先確認 */
  allowCourseChange: boolean;
  /** 同工在報到現場報名：額滿課程可登記備取、可記錄收費、報名後回報到系統直接報到 */
  onsite?: boolean;
  /** 現場報名先查過的家長手機（新家庭帶入；既有家庭直接查詢） */
  initialPhone?: string;
  /** 同工現場報名（已登入同工）：家長登入可直接用手機查詢，第一次報名可不設 PIN */
  staff?: boolean;
  /** 這台裝置記住的家庭 */
  remembered?: { name: string; phone: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [lookup, setLookup] = useState({ phone: initialPhone });
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);
  const [found, setFound] = useState(mode === 'new');
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  // 已報名孩子的報名內容（只顯示，不送回伺服器）
  const [regInfo, setRegInfo] = useState<Record<string, { 序號: string; 狀態: string; 年級: string; 課程: string; 課程ID: string[] }>>({});
  // 正在修改課程的已報名孩子：成員ID → 選取中的課程
  const [editingCourses, setEditingCourses] = useState<Record<string, string[]>>({});
  const [courseMessage, setCourseMessage] = useState<Record<string, string>>({});
  // 不可修改課程時，送出前的確認視窗
  const [confirming, setConfirming] = useState(false);
  const [household, setHousehold] = useState<HouseholdInput>({ 主要聯絡人: '', 電話: mode === 'new' ? initialPhone : '', Email: '', 地址: '' });
  // 現場報名：當場收費、報名後直接報到
  const [paid, setPaid] = useState(false);
  const [autoCheckIn, setAutoCheckIn] = useState(true);
  const [members, setMembers] = useState<MemberInput[]>(mode === 'new' ? [emptyMember(defaultType)] : []);
  const [consent, setConsent] = useState(false);
  const [photoConsent, setPhotoConsent] = useState(false);
  const [followUpConsent, setFollowUpConsent] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [remember, setRemember] = useState(true);

  const courseGroups = [...new Set(courses.map((c) => c.groupName))];
  const courseOrder = courses.map((c) => c.id);

  const updateMember = (i: number, patch: Partial<MemberInput>) =>
    setMembers((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const doLookup = () =>
    startTransition(async () => {
      setError('');
      const res = await lookupHousehold(eventId, staff ? lookup.phone : undefined);
      if (res.error || !res.household) {
        setError(res.error ?? '查無資料');
        setFound(false);
        return;
      }
      setHousehold(res.household);
      setRegisteredIds(res.registrationIds ?? []);
      setRegistered(new Set(res.members?.filter((m) => m.registered).map((m) => m.成員ID)));
      setRegInfo(Object.fromEntries((res.members ?? []).filter((m) => m.registration).map((m) => [m.成員ID, m.registration!])));
      setMembers(
        (res.members ?? []).map(({ registered: _registered, registration: _registration, ...m }) => ({ ...m, courses: [], selected: false })),
      );
      setFound(true);
    });

  // 現場報名先查過手機的既有家庭：進來就直接帶出資料
  useEffect(() => {
    if (mode === 'returning' && staff && initialPhone) doLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCourses = (成員ID: string) =>
    startTransition(async () => {
      setError('');
      setErrors([]);
      const res = await changeCourses(eventId, 成員ID, editingCourses[成員ID] ?? [], staff ? lookup.phone : undefined);
      if (res.error) {
        setError(res.error);
        setErrors(res.errors ?? []);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setRegInfo((info) => ({ ...info, [成員ID]: { ...info[成員ID], 課程: res.課程 ?? '', 課程ID: res.課程ID ?? [] } }));
      setEditingCourses(({ [成員ID]: _done, ...rest }) => rest);
      setCourseMessage((msg) => ({ ...msg, [成員ID]: '已更新課程' }));
    });

  /** 要送出的報名（有勾選的孩子）與各自選的課程名稱，確認視窗用 */
  const selectedForSubmit = members
    .filter((m) => m.selected && !(m.成員ID && registered.has(m.成員ID)))
    .map((m) => ({ name: m.姓名 || '（未填姓名）', courses: m.courses.map((id) => courses.find((c) => c.id === id)?.name ?? '').filter(Boolean) }));

  // 不可修改課程的活動：先跳出確認，確認後才真正送出
  const requestSubmit = () => {
    // 生日先在前端檢查，錯誤提示比確認視窗先出現（伺服器送出時還會再檢查一次）
    const birthdayErrors = members
      .filter((m) => m.selected && !(m.成員ID && registered.has(m.成員ID)) && birthdayProblem(m))
      .map((m) => `${m.姓名 || '（未填姓名）'}：${birthdayProblem(m)}`);
    if (birthdayErrors.length) {
      setError('有報名者不符合資格');
      setErrors(birthdayErrors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (!allowCourseChange && courses.length > 0) setConfirming(true);
    else submit();
  };

  const submit = () =>
    startTransition(async () => {
      setConfirming(false);
      setError('');
      setErrors([]);
      const res = await submitRegistration({
        eventId,
        source,
        household,
        members,
        mode,
        lookup: mode === 'returning' && staff ? lookup : undefined,
        pin: mode === 'new' ? pin : undefined,
        pinConfirm: mode === 'new' ? pinConfirm : undefined,
        remember,
        consent,
        photoConsent,
        followUpConsent,
        paid: onsite ? paid : undefined,
      });
      if (res.error) {
        setError(res.error);
        setErrors(res.errors ?? []);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      // 現場報名：回到報到系統，剛報名的孩子直接報到（報到紀錄由報到系統寫入）
      if (onsite && autoCheckIn) {
        window.location.href = `/checkin/e/${eventId}?checkin=${(res.ids ?? []).join(',')}`;
        return;
      }
      const qs = new URLSearchParams({ ids: (res.ids ?? []).join(',') });
      if (source !== '線上') qs.set('source', source);
      router.push(`/e/${eventId}/done?${qs}`);
    });

  const messages = (error || errors.length > 0) && (
    <Alert>
      <div className="font-medium">{error}</div>
      {errors.length > 0 && (
        <ul className="mt-1 list-inside list-disc">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </Alert>
  );

  if (!found && !staff) {
    return (
      <div className="space-y-4">
        {messages}
        <FamilyLogin remembered={remembered} onVerified={doLookup} />
      </div>
    );
  }

  if (!found) {
    return (
      <Card title="查詢家庭資料（同工現場報名）">
        <div className="space-y-3">
          {messages}
          <Field label="手機號碼" required>
            <Input
              inputMode="tel"
              value={lookup.phone}
              onChange={(e) => setLookup({ phone: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && lookup.phone && doLookup()}
            />
          </Field>
          <Button onClick={doLookup} disabled={pending || !lookup.phone}>
            {pending ? '查詢中…' : '查詢'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {messages}
      {mode === 'returning' && (
        <Alert tone="blue">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>勾選這次要報名的孩子，沒有勾選的不會報名；也可以新增家庭成員。</span>
            {!staff && (
              <button
                type="button"
                className="text-sm underline"
                onClick={() =>
                  startTransition(async () => {
                    await familySignOut();
                    setMembers([]);
                    setFound(false);
                  })
                }
              >
                更換登入手機
              </button>
            )}
          </div>
        </Alert>
      )}
      {registeredIds.length > 0 && (
        <div data-tour="done-card">
        <Card title="已完成報名">
          <p className="mb-3 text-sm text-gray-700">此家庭在本活動已有 {registeredIds.length} 位報名，活動當天出示報到 QR code 即可快速報到。</p>
          <Link href={`/e/${eventId}/done?view=qr&ids=${registeredIds.join(',')}`} className={buttonClass('primary')}>
            顯示報到 QR code
          </Link>
        </Card>
        </div>
      )}
      <div data-tour="contact">
      <Card title="家庭聯絡資料">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="主要聯絡人" required>
            <Input
              value={household.主要聯絡人}
              readOnly={mode === 'returning'}
              onChange={(e) => setHousehold({ ...household, 主要聯絡人: e.target.value })}
            />
          </Field>
          <Field label="手機號碼" required>
            <Input
              inputMode="tel"
              value={household.電話}
              readOnly={mode === 'returning'}
              onChange={(e) => setHousehold({ ...household, 電話: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input type="email" value={household.Email} onChange={(e) => setHousehold({ ...household, Email: e.target.value })} />
          </Field>
          <Field label="地址">
            <Input value={household.地址} onChange={(e) => setHousehold({ ...household, 地址: e.target.value })} />
          </Field>
        </div>
      </Card>
      </div>

      {members.map((m, i) => {
        const already = !!m.成員ID && registered.has(m.成員ID);
        const existing = !!m.成員ID;
        return (
          <div key={m.成員ID ?? `new-${i}`} data-tour={i === 0 ? 'member' : undefined}>
          <Card
            title={
              existing ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={m.selected}
                    disabled={already}
                    onChange={(e) => updateMember(i, { selected: e.target.checked })}
                  />
                  {m.姓名}
                  {already && <span className="text-sm font-normal text-emerald-700">（已報名）</span>}
                </label>
              ) : (
                `報名者 ${i + 1}`
              )
            }
            actions={
              !existing &&
              members.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => setMembers((ms) => ms.filter((_, idx) => idx !== i))}>
                  移除
                </Button>
              )
            }
            className={existing && !m.selected && !already ? 'opacity-60' : ''}
          >
            {/* 已報名：直接顯示本次報名內容（唯讀） */}
            {already && regInfo[m.成員ID!] && (
              <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                {[
                  ['報名序號', regInfo[m.成員ID!].序號],
                  ['報名狀態', regInfo[m.成員ID!].狀態],
                  ['年級', regInfo[m.成員ID!].年級],
                  ['課程', regInfo[m.成員ID!].課程 || '—'],
                  ['學校', m.學校 || '—'],
                  ['特殊需求', m.特殊需求 || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3 py-1">
                    <dt className="w-16 shrink-0 text-gray-500">{label}</dt>
                    <dd className="font-semibold text-gray-900">{value}</dd>
                  </div>
                ))}
                {allowCourseChange && courses.length > 0 ? (
                  <div className="sm:col-span-2">
                    {editingCourses[m.成員ID!] ? (
                      <div className="mt-2 space-y-3 rounded-2xl border border-gray-200 p-3">
                        <div className="text-sm font-medium text-gray-700">
                          修改課程
                          <span className="ml-2 text-xs font-normal text-gray-500">{maxCoursesPerMember === 1 ? '請選擇 1 門' : maxCoursesPerMember > 0 ? `最多 ${maxCoursesPerMember} 門` : '可複選'}</span>
                        </div>
                        <CourseCards
                          // 原本已選的課程不算額滿，取消後也能再選回來
                          courses={courses
                            .filter((c) => fitsGrade(c, regInfo[m.成員ID!].年級 || m.年級))
                            .map((c) => (regInfo[m.成員ID!].課程ID.includes(c.id) ? { ...c, full: false } : c))}
                          groups={courseGroups}
                          order={courseOrder}
                          selected={editingCourses[m.成員ID!]}
                          max={maxCoursesPerMember}
                          onChange={(ids) => setEditingCourses((e) => ({ ...e, [m.成員ID!]: ids }))}
                        />
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={() => setEditingCourses(({ [m.成員ID!]: _c, ...rest }) => rest)}>
                            取消
                          </Button>
                          <Button size="sm" disabled={pending || editingCourses[m.成員ID!].length === 0} onClick={() => saveCourses(m.成員ID!)}>
                            {pending ? '儲存中…' : '儲存課程'}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <p className="text-xs text-gray-500">{courseMessage[m.成員ID!] || '報名期間內可以修改課程。'}</p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setCourseMessage(({ [m.成員ID!]: _m, ...rest }) => rest);
                            setEditingCourses((e) => ({ ...e, [m.成員ID!]: regInfo[m.成員ID!].課程ID }));
                          }}
                        >
                          修改課程
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500 sm:col-span-2">已完成報名，如需修改請聯絡主辦單位。</p>
                )}
              </dl>
            )}
            {(m.selected || !existing) && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="姓名" required>
                  <Input value={m.姓名} readOnly={existing} onChange={(e) => updateMember(i, { 姓名: e.target.value })} />
                </Field>
                <Field label="性別" required>
                  <Select value={m.性別} disabled={existing} onChange={(e) => updateMember(i, { 性別: e.target.value })}>
                    <option value="">請選擇</option>
                    <option>男</option>
                    <option>女</option>
                  </Select>
                </Field>
                <Field label="年級" required hint={existing ? '請確認為目前年級' : undefined}>
                  <Select value={m.年級} onChange={(e) => updateMember(i, { 年級: e.target.value, courses: m.courses.filter((id) => courses.some((c) => c.id === id && fitsGrade(c, e.target.value))) })}>
                    <option value="">請選擇</option>
                    {grades.map((g) => (
                      <option key={g}>{g}</option>
                    ))}
                    {m.年級 && !grades.includes(m.年級) && <option>{m.年級}</option>}
                  </Select>
                </Field>
                <Field label="生日" required hint={m.類型 === '兒童' ? '需年滿 3.5 歲' : undefined}>
                  <Input type="date" required max={new Date().toISOString().slice(0, 10)} value={m.生日} onChange={(e) => updateMember(i, { 生日: e.target.value })} />
                  {/* 輸入生日後立即檢查；還沒填時不提示，送出時才提醒 */}
                  {m.生日 && birthdayProblem(m) && <p className="mt-1 text-sm font-semibold text-red-600">{birthdayProblem(m)}</p>}
                </Field>
                <Field label="學校">
                  <Input value={m.學校} onChange={(e) => updateMember(i, { 學校: e.target.value })} />
                </Field>
                <div className="sm:col-span-3">
                  <Field label="特殊需求" hint="過敏、用藥、需要特別照顧的地方">
                    <Textarea rows={2} value={m.特殊需求} onChange={(e) => updateMember(i, { 特殊需求: e.target.value })} />
                  </Field>
                </div>
                {courses.length > 0 && (
                  <div className="sm:col-span-3" data-tour={i === 0 ? 'course' : undefined}>
                    <div className="mb-2 text-sm font-medium text-gray-700">
                      課程<span className="ml-0.5 text-red-500">*</span>
                      <span className="ml-2 text-xs font-normal text-gray-500">{maxCoursesPerMember === 1 ? '請選擇 1 門' : maxCoursesPerMember > 0 ? `最多 ${maxCoursesPerMember} 門` : '可複選'}</span>
                    </div>
                    {!m.年級 ? (
                      <p className="course-empty">請先選擇年級，才會列出適合的課程。</p>
                    ) : (
                    <CourseCards
                      courses={courses.filter((c) => fitsGrade(c, m.年級))}
                      groups={courseGroups}
                      order={courseOrder}
                      selected={m.courses}
                      max={maxCoursesPerMember}
                      allowWaitlist={onsite}
                      onChange={(ids) => updateMember(i, { courses: ids })}
                    />
                    )}
                    {source === '現場' && !allowOnSiteCourseRegistration && <p className="mt-1 text-xs text-amber-700">此活動不開放現場報名課程</p>}
                  </div>
                )}
              </div>
            )}
          </Card>
          </div>
        );
      })}

      <Button variant="secondary" data-tour="add" onClick={() => setMembers((ms) => [...ms, emptyMember(defaultType)])}>
        ＋ 新增{mode === 'returning' ? '家庭成員' : '同戶報名者'}
      </Button>

      {mode === 'new' && (
        <div data-tour="pin">
        <Card title="設定 PIN">
          <p className="mb-3 text-sm text-gray-600">
            {staff ? '同工現場代填可以先不設定，家長之後可用孩子的姓名與生日驗證再設定。' : '請設定 4 位數字的 PIN。下次報名選「家長登入」，輸入手機＋PIN 就能自動帶入家長與孩子的資料。'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="PIN（4 位數字）" required={!staff}>
              <Input inputMode="numeric" type="password" autoComplete="new-password" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </Field>
            <Field label="再輸入一次" required={!staff}>
              <Input inputMode="numeric" type="password" autoComplete="new-password" maxLength={4} value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))} />
            </Field>
          </div>
          {pin.length === 4 && pinConfirm.length === 4 && pin !== pinConfirm && <p className="mt-2 text-sm text-red-600">兩次輸入的 PIN 不一致</p>}
          {!staff && (
            <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              記住這台裝置（90 天內不用再輸入 PIN；共用電腦請不要勾）
            </label>
          )}
        </Card>
        </div>
      )}

      {onsite && (() => {
        // 應收：已勾選孩子（非備取）所選課程的材料費合計
        const fee = (ids: string[]) => ids.reduce((sum, id) => sum + (courses.find((c) => c.id === id)?.fee ?? 0), 0);
        const picked = members.filter((m) => m.selected && !(m.成員ID && registered.has(m.成員ID)));
        const waitlisted = picked.filter((m) => m.courses.some((id) => courses.find((c) => c.id === id)?.full));
        const total = picked.filter((m) => !waitlisted.includes(m)).reduce((sum, m) => sum + fee(m.courses), 0);
        return (
          <Card title="現場收費與報到">
            <div className="space-y-3 text-sm text-gray-700">
              <p>
                應收材料費 <span className="text-lg font-bold text-gray-900">{total}</span> 元
                {waitlisted.length > 0 && <span className="ml-2 text-amber-700">（{waitlisted.map((m) => m.姓名 || '未填姓名').join('、')} 為備取，先不收費）</span>}
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
                已收費（記錄繳費金額、時間與收款人）
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4" checked={autoCheckIn} onChange={(e) => setAutoCheckIn(e.target.checked)} />
                報名後直接報到（回到報到畫面）
              </label>
            </div>
          </Card>
        );
      })()}

      <div data-tour="consent">
      <Card>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            我同意主辦單位為辦理本活動（報名、報到、分組、聯繫與保險）蒐集並使用以上個人資料，資料僅於活動相關用途使用。
          </span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={photoConsent} onChange={(e) => setPhotoConsent(e.target.checked)} />
          <span>我同意活動照片／影片於活動紀錄或成果分享中公開使用。</span>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
          <input type="checkbox" className="mt-1" checked={followUpConsent} onChange={(e) => setFollowUpConsent(e.target.checked)} />
          <span>我同意接收後續活動通知。</span>
        </label>
        <label className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-4 text-sm font-semibold text-gray-900">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={consent && photoConsent && followUpConsent}
            onChange={(e) => {
              setConsent(e.target.checked);
              setPhotoConsent(e.target.checked);
              setFollowUpConsent(e.target.checked);
            }}
          />
          以上皆同意
        </label>
      </Card>
      </div>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <h2 id="confirm-title" className="text-lg font-bold text-gray-900">
              確認送出報名
            </h2>
            <p className="mt-2 text-sm font-semibold text-red-600">一旦送出後無法更改課程，請確認課程都選對了。</p>
            <ul className="mt-4 space-y-2 text-sm">
              {selectedForSubmit.map((m, i) => (
                <li key={i} className="rounded-2xl bg-gray-50 px-4 py-2">
                  <span className="font-semibold text-gray-900">{m.name}</span>
                  <span className="text-gray-600">：{m.courses.join('、') || '（未選課程）'}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                再檢查一下
              </Button>
              <Button onClick={submit} disabled={pending}>
                確認送出
              </Button>
            </div>
          </div>
        </div>
      )}

      <Button size="lg" className="w-full" data-tour="submit" onClick={requestSubmit} disabled={pending || !consent || (mode === 'new' && !staff && (pin.length !== 4 || pin !== pinConfirm))}>
        {pending ? '送出中…' : '送出報名'}
      </Button>
    </div>
  );
}

/** 課程卡片：max = 1 時為單選（再點一次可取消），其餘為複選 */
function CourseCards({
  courses,
  groups,
  order,
  selected,
  max,
  allowWaitlist = false,
  onChange,
}: {
  courses: CourseOption[];
  /** 同工現場報名：額滿的課程也能選，登記為備取（只能單獨選這一門） */
  allowWaitlist?: boolean;
  /** 整場活動的課程分組（決定顏色） */
  groups: string[];
  /** 整場活動的課程順序（決定卡片插圖，篩選年級後每門課的插圖不變） */
  order: string[];
  selected: string[];
  max: number;
  onChange: (ids: string[]) => void;
}) {
  if (courses.length === 0) return <p className="course-empty">沒有適合此年級的課程。</p>;
  const single = max === 1;
  return (
    <div role={single ? 'radiogroup' : 'group'} aria-label="課程" className="grid gap-3 sm:grid-cols-2">
      {courses.map((c) => {
        const checked = selected.includes(c.id);
        const waitlist = allowWaitlist && c.full;
        const unavailable = (c.full && !waitlist) || (c.registrationState !== 'open' && !allowWaitlist);
        const blockedByMax = !single && !checked && !waitlist && max > 0 && selected.length >= max;
        const disabled = unavailable || blockedByMax;
        const status = waitlist ? '額滿・可備取' : c.full ? '額滿' : c.registrationState === 'upcoming' ? '尚未開放' : c.registrationState === 'closed' ? '已截止' : '';
        const low = c.remaining != null && c.remaining <= 3;
        const toggle = () => {
          if (disabled && !checked) return;
          if (single) onChange(checked ? [] : [c.id]);
          else if (checked) onChange(selected.filter((x) => x !== c.id));
          // 不能同時有正取和備取：選備取課程時只留這一門；選一般課程時拿掉已選的備取課程
          else if (waitlist) onChange([c.id]);
          else onChange([...selected.filter((x) => !courses.find((o) => o.id === x)?.full), c.id]);
        };
        return (
          <button
            key={c.id}
            type="button"
            role={single ? 'radio' : 'checkbox'}
            aria-checked={checked}
            aria-disabled={disabled && !checked}
            onClick={toggle}
            className={['course-card', checked && 'is-checked', disabled && !checked && 'is-disabled', !single && 'is-multi'].filter(Boolean).join(' ')}
          >
            <span className={`course-art course-art-${(Math.max(order.indexOf(c.id), 0) % 5) + 1}`} aria-hidden />
            <span className="course-check" aria-hidden>
              {checked && '✓'}
            </span>
            <span className="course-tags">
              {c.groupName && (
                <span className="course-tag">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: groupColor(groups, c.groupName) }} />
                  {c.groupName}
                </span>
              )}
              {c.fee > 0 && <span className="course-chip course-chip-fee">材料費 {c.fee} 元</span>}
              {status && <span className="course-chip course-chip-status">{status}</span>}
            </span>
            <span className="course-name">{c.name}</span>
            {(c.audience || c.description) && <span className="course-meta">{[c.audience, c.description].filter(Boolean).join('｜')}</span>}
            {c.notice && <span className="course-notice">注意：{c.notice}</span>}
            <span className="mt-auto pt-4">
              {c.capacity != null && c.remaining != null ? (
                <>
                  <span className={`course-seats${low && !c.full ? ' is-low' : ''}`}>
                    <span>{c.full ? '名額已滿' : `剩 ${c.remaining} 個名額`}</span>
                    <span className="course-seats-total">共 {c.capacity} 名</span>
                  </span>
                  <span className="course-bar">
                    <span style={{ width: `${Math.round(((c.capacity - c.remaining) / c.capacity) * 100)}%` }} />
                  </span>
                </>
              ) : (
                <span className="course-seats-total">名額不限</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
