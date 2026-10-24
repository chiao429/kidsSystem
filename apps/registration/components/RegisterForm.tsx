'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea, buttonClass } from '@kids/ui';
import { gradeRank } from '@kids/schema';
import { lookupHousehold, submitRegistration } from '@/lib/actions';
import type { CourseOption, HouseholdInput, MemberInput } from '@/lib/types';

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
}: {
  eventId: string;
  mode: 'new' | 'returning';
  source: string;
  grades: string[];
  courses: CourseOption[];
  defaultType: string;
  maxCoursesPerMember: number;
  allowOnSiteCourseRegistration: boolean;
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

  const updateMember = (i: number, patch: Partial<MemberInput>) =>
    setMembers((ms) => ms.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));

  const doLookup = () =>
    startTransition(async () => {
      setError('');
      const res = await lookupHousehold(eventId, lookup.phone);
      if (res.error || !res.household) {
        setError(res.error ?? '查無資料');
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
        lookup: mode === 'returning' ? lookup : undefined,
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

  if (!found) {
    return (
      <Card title="查詢家庭資料">
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
                  <Select value={m.年級} onChange={(e) => updateMember(i, { 年級: e.target.value })}>
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
                    <div className="mb-1 text-sm font-medium text-gray-700">
                      課程<span className="ml-0.5 text-red-500">*</span>{maxCoursesPerMember > 0 && <span className="ml-2 text-xs font-normal text-gray-500">最多 {maxCoursesPerMember} 門</span>}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {courses.filter((c) => (!c.minGrade || gradeRank(m.年級) >= gradeRank(c.minGrade)) && (!c.maxGrade || gradeRank(m.年級) <= gradeRank(c.maxGrade))).map((c) => (
                        <label key={c.id} className={`flex max-w-sm items-start gap-1.5 ${c.full || c.registrationState !== 'open' ? 'text-gray-400' : ''}`}>
                          <input
                            type={maxCoursesPerMember === 1 ? 'radio' : 'checkbox'}
                            name={maxCoursesPerMember === 1 ? `course-${i}` : undefined}
                            disabled={c.full || c.registrationState !== 'open' || (!m.courses.includes(c.id) && !!maxCoursesPerMember && m.courses.length >= maxCoursesPerMember)}
                            checked={m.courses.includes(c.id)}
                            onChange={(e) =>
                              updateMember(i, {
                                courses: e.target.checked ? (maxCoursesPerMember === 1 ? [c.id] : [...m.courses, c.id]) : m.courses.filter((x) => x !== c.id),
                              })
                            }
                          />
                          <span>
                            <span className="font-medium">{c.name}</span>
                            {c.groupName && <span className="ml-1 text-xs">[{c.groupName}]</span>}
                            {c.full ? <Badge tone="red">額滿</Badge> : c.registrationState === 'upcoming' ? <Badge tone="gray">尚未開始</Badge> : c.registrationState === 'closed' ? <Badge tone="gray">已截止</Badge> : c.remaining != null && c.remaining <= 5 ? <span className="ml-1">（剩 {c.remaining} 名）</span> : null}
                            {(c.audience || c.description || c.notice || c.fee > 0) && <span className="block text-xs text-gray-600">{[c.audience, c.description, c.fee > 0 ? `材料費 ${c.fee} 元` : '', c.notice].filter(Boolean).join('｜')}</span>}
                          </span>
                        </label>
                      ))}
                    </div>
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
      </Card>

      <Button size="lg" className="w-full" onClick={submit} disabled={pending || !consent}>
        {pending ? '送出中…' : '送出報名'}
      </Button>
    </div>
  );
}
