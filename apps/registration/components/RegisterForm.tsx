'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Card, Field, Input, Select, Textarea, buttonClass } from '@kids/ui';
import { gradeRank } from '@kids/schema';
import { familySignOut, lookupHousehold, submitRegistration } from '@/lib/actions';
import { FamilyLogin } from './FamilyLogin';
import type { CourseOption, HouseholdInput, MemberInput } from '@/lib/types';

/** 課程是否適合此年級 */
const fitsGrade = (c: CourseOption, grade: string) =>
  !!grade && (!c.minGrade || gradeRank(grade) >= gradeRank(c.minGrade)) && (!c.maxGrade || gradeRank(grade) <= gradeRank(c.maxGrade));

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
  staff = false,
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
  /** 同工現場報名（已登入同工）：曾經報名過可直接用手機查詢，第一次報名可不設 PIN */
  staff?: boolean;
  /** 這台裝置記住的家庭 */
  remembered?: { name: string; phone: string };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [lookup, setLookup] = useState({ phone: '' });
  const [registeredIds, setRegisteredIds] = useState<string[]>([]);
  const [found, setFound] = useState(mode === 'new');
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [household, setHousehold] = useState<HouseholdInput>({ 主要聯絡人: '', 電話: '', Email: '', 地址: '' });
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
      setMembers(
        (res.members ?? []).map(({ registered: _registered, ...m }) => ({ ...m, courses: [], selected: false })),
      );
      setFound(true);
    });

  const submit = () =>
    startTransition(async () => {
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
      });
      if (res.error) {
        setError(res.error);
        setErrors(res.errors ?? []);
        window.scrollTo({ top: 0, behavior: 'smooth' });
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
                換一個家庭
              </button>
            )}
          </div>
        </Alert>
      )}
      {registeredIds.length > 0 && (
        <Card title="已完成報名">
          <p className="mb-3 text-sm text-gray-700">此家庭在本活動已有 {registeredIds.length} 位報名，活動當天出示報到 QR code 即可快速報到。</p>
          <Link href={`/e/${eventId}/done?view=qr&ids=${registeredIds.join(',')}`} className={buttonClass('primary')}>
            顯示報到 QR code
          </Link>
        </Card>
      )}
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

      {members.map((m, i) => {
        const already = !!m.成員ID && registered.has(m.成員ID);
        const existing = !!m.成員ID;
        return (
          <Card
            key={m.成員ID ?? `new-${i}`}
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
            className={existing && !m.selected ? 'opacity-60' : ''}
          >
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
                <Field label="生日">
                  <Input type="date" value={m.生日} onChange={(e) => updateMember(i, { 生日: e.target.value })} />
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
                  <div className="sm:col-span-3">
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
                      onChange={(ids) => updateMember(i, { courses: ids })}
                    />
                    )}
                    {source === '現場' && !allowOnSiteCourseRegistration && <p className="mt-1 text-xs text-amber-700">此活動不開放現場報名課程</p>}
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <Button variant="secondary" onClick={() => setMembers((ms) => [...ms, emptyMember(defaultType)])}>
        ＋ 新增{mode === 'returning' ? '家庭成員' : '同戶報名者'}
      </Button>

      {mode === 'new' && (
        <Card title="設定 PIN">
          <p className="mb-3 text-sm text-gray-600">
            {staff ? '同工現場代填可以先不設定，家長之後可用孩子的姓名與生日驗證再設定。' : '請設定 4 位數字的 PIN。下次報名選「曾經報名過」，輸入手機＋PIN 就能自動帶入家長與孩子的資料。'}
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
      )}

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

      <Button size="lg" className="w-full" onClick={submit} disabled={pending || !consent || (mode === 'new' && !staff && (pin.length !== 4 || pin !== pinConfirm))}>
        {pending ? '送出中…' : '送出報名'}
      </Button>
    </div>
  );
}

/** 課程分組的識別色（標籤前的小圓點）；卡片其餘外觀由版面主題 CSS 的 course-* class 決定 */
const GROUP_DOTS = ['bg-[#ff8a00]', 'bg-[#4aa8ff]', 'bg-[#3ddc84]', 'bg-[#ff54bb]', 'bg-[#ffd400]'];

/** 依分組在整場活動課程中的出現順序配色：不論年級篩出哪些課程，同一分組永遠同色，不同分組不同色 */
function dotOf(groups: string[], group: string) {
  return GROUP_DOTS[Math.max(groups.indexOf(group), 0) % GROUP_DOTS.length];
}

/** 課程卡片：max = 1 時為單選（再點一次可取消），其餘為複選 */
function CourseCards({
  courses,
  groups,
  order,
  selected,
  max,
  onChange,
}: {
  courses: CourseOption[];
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
        const unavailable = c.full || c.registrationState !== 'open';
        const blockedByMax = !single && !checked && max > 0 && selected.length >= max;
        const disabled = unavailable || blockedByMax;
        const status = c.full ? '額滿' : c.registrationState === 'upcoming' ? '尚未開放' : c.registrationState === 'closed' ? '已截止' : '';
        const low = c.remaining != null && c.remaining <= 3;
        const toggle = () => {
          if (disabled && !checked) return;
          if (single) onChange(checked ? [] : [c.id]);
          else onChange(checked ? selected.filter((x) => x !== c.id) : [...selected, c.id]);
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
                  <span className={`h-2.5 w-2.5 rounded-full ${dotOf(groups, c.groupName)}`} />
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
