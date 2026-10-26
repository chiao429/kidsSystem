'use server';

import {
  GroupRole,
  GroupType,
  ENROLLED_ROLES,
  LEARNER_ROLES,
  MemberType,
  courseLabel,
  PaymentStatus,
  RegistrationSource,
  RegistrationStatus,
  RegistrationType,
  newId,
  normalizeGrade,
  normalizePhone,
  nowString,
} from '@kids/schema';
import { checkMember, initialStatus, isActive, isCourseFull, loadCourseState, nextSerial } from './eligibility';
import {
  findHousehold,
  hashPin,
  currentStaffName,
  isStaff,
  isValidPin,
  loginWithPin,
  resolveReturningFamily,
  setPinAfterVerify,
  signInFamily,
  signOutFamily,
  verifyByChild,
  type FamilyAuthResult,
} from './family-auth';
import { getEvent, registrationWindow } from './events';
import { groupMembers, groups, households, members, registrations } from './tables';
import type { LookupResult, MemberInput, RegisterPayload, RegisterResult } from './types';

const clean = (v: unknown) => String(v ?? '').trim().slice(0, 200);

// ── 家長驗證（手機＋PIN；忘記 PIN 用孩子生日） ──

export async function familyLogin(phone: string, pin: string, remember: boolean): Promise<FamilyAuthResult> {
  return loginWithPin(clean(phone), clean(pin), remember);
}

export async function familyVerifyChild(phone: string, name: string, birthday: string): Promise<FamilyAuthResult> {
  return verifyByChild(clean(phone), clean(name), clean(birthday));
}

export async function familySetPin(pin: string, confirm: string, remember: boolean): Promise<FamilyAuthResult> {
  return setPinAfterVerify(clean(pin), clean(confirm), remember);
}

/** 不是我／換一個家庭：清掉這台裝置記住的家庭 */
export async function familySignOut(): Promise<void> {
  signOutFamily();
}

/** 現場報名第一步：同工輸入家長手機，查是否已有家庭資料 */
export async function onsiteFindFamily(phone: string): Promise<{ error?: string; exists?: boolean; name?: string; phone?: string }> {
  if (!isStaff()) return { error: '請先以同工帳號登入' };
  const p = normalizePhone(clean(phone));
  if (!/^09\d{8}$/.test(p)) return { error: '請輸入正確的手機號碼（09 開頭 10 碼）' };
  const household = await findHousehold(p);
  return { exists: !!household, name: household?.主要聯絡人, phone: p };
}

/**
 * 「家長登入」帶入家庭資料：只回傳以 PIN 驗證過的家庭；同工現場報名可直接用手機查詢（staffPhone）。
 */
export async function lookupHousehold(eventId: string, staffPhone?: string): Promise<LookupResult> {
  const event = await getEvent(eventId);
  if (!event) return { error: '找不到活動' };
  const household = await resolveReturningFamily(staffPhone ? clean(staffPhone) : undefined);
  if (!household) return { error: staffPhone ? '查無資料，請確認手機號碼，或改用「初次報名」' : '請先輸入手機與 PIN', needsLogin: !staffPhone };

  const [allMembers, regs] = await Promise.all([members().all(), registrations(event.活動ID).all()]);
  const activeRegs = regs.filter(isActive);
  const registered = new Set(activeRegs.map((r) => r.成員ID));
  // 已報名的孩子：帶出本活動的報名內容（家長在表單上直接查看，不能修改）
  const [gg, gm] = await Promise.all([groups(event.活動ID).all(), groupMembers(event.活動ID).all()]);
  const registrationOf = (成員ID: string) => {
    const r = activeRegs.find((x) => x.成員ID === 成員ID && x.家庭ID === household.家庭ID);
    if (!r) return undefined;
    const enrolled = gm.filter((m) => m.報名ID === r.報名ID && m.類型 === GroupType.Course && ENROLLED_ROLES.includes(m.角色));
    // 修改課程只針對正取的課程；備取的課程只顯示
    const ids = enrolled.filter((m) => LEARNER_ROLES.includes(m.角色)).map((m) => m.分組ID);
    const courses = enrolled.map((m) => courseLabel(gg.find((g) => g.分組ID === m.分組ID)?.名稱 ?? '', m.角色)).filter((n) => n && !n.startsWith('（'));
    return { 序號: r.序號, 狀態: r.狀態, 年級: r.年級, 課程: courses.join('、'), 課程ID: ids };
  };
  return {
    registrationIds: activeRegs.filter((r) => r.家庭ID === household.家庭ID).map((r) => r.報名ID),
    household: {
      家庭ID: household.家庭ID,
      主要聯絡人: household.主要聯絡人,
      電話: household.電話,
      Email: household.Email,
      地址: household.地址,
    },
    members: allMembers
      .filter((m) => m.家庭ID === household.家庭ID)
      .map((m) => ({
        成員ID: m.成員ID,
        姓名: m.姓名,
        性別: m.性別,
        生日: m.生日,
        年級: m.年級,
        學校: m.學校,
        類型: m.類型,
        特殊需求: m.特殊需求,
        registered: registered.has(m.成員ID),
        registration: registrationOf(m.成員ID),
      })),
  };
}

/** 以手機號碼查詢此家庭在本活動的報名（不受報名期間限制，供家長找回報到 QR code） */
/** 報到 QR code：只查以 PIN 驗證過的家庭在本活動的報名（不受報名期間限制） */
export async function lookupQr(eventId: string): Promise<{ error?: string; ids?: string[]; needsLogin?: boolean }> {
  const event = await getEvent(eventId);
  if (!event) return { error: '找不到活動' };
  const household = await resolveReturningFamily();
  if (!household) return { error: '請先輸入手機與 PIN', needsLogin: true };
  const ids = (await registrations(event.活動ID).all())
    .filter((r) => isActive(r) && r.家庭ID === household.家庭ID)
    .map((r) => r.報名ID);
  if (ids.length === 0) return { error: '這個家庭在本活動沒有報名紀錄' };
  return { ids };
}

/**
 * 家長登入後修改個人資訊（不影響報名）：家庭的 Email／地址，孩子的生日、學校、特殊需求。
 * 年級與課程會影響報名資格，不在這裡修改。
 */
export async function saveFamilyProfile(input: {
  household: { Email: string; 地址: string };
  members: { 成員ID: string; 生日: string; 學校: string; 特殊需求: string }[];
  staffPhone?: string;
}): Promise<{ error?: string; message?: string }> {
  const household = await resolveReturningFamily(input.staffPhone ? clean(input.staffPhone) : undefined);
  if (!household) return { error: '登入已失效，請重新輸入手機與 PIN' };
  const now = nowString();
  const family = (await members().all({ fresh: true })).filter((m) => m.家庭ID === household.家庭ID);
  const patches = input.members
    .filter((m) => family.some((f) => f.成員ID === m.成員ID))
    .map((m) => ({ id: m.成員ID, changes: { 生日: clean(m.生日), 學校: clean(m.學校), 特殊需求: clean(m.特殊需求), 更新時間: now } }));
  await households().updateByIds([{ id: household.家庭ID, changes: { Email: clean(input.household.Email), 地址: clean(input.household.地址), 更新時間: now } }]);
  if (patches.length) await members().updateByIds(patches);
  return { message: '已儲存個人資訊' };
}

/**
 * 已報名的孩子修改課程：活動設定允許、報名期間內（同工現場不受限），且只能改自己家庭的報名。
 * 名額計算扣掉這位孩子原本的課程，原本已選的課程即使額滿也可以保留。
 */
export async function changeCourses(
  eventId: string,
  成員ID: string,
  courseIds: string[],
  staffPhone?: string,
): Promise<{ error?: string; errors?: string[]; 課程?: string; 課程ID?: string[] }> {
  const event = await getEvent(eventId);
  if (!event) return { error: '找不到活動' };
  const rules = event.rules;
  if (!rules.allowCourseChange) return { error: '本活動報名後無法修改課程，如需調整請聯絡主辦單位' };
  const onSite = !!staffPhone && isStaff();
  if (!registrationWindow(event).open && !onSite) return { error: '已過報名期間，無法修改課程' };
  const household = await resolveReturningFamily(staffPhone ? clean(staffPhone) : undefined);
  if (!household) return { error: '登入已失效，請重新輸入手機與 PIN' };

  const regs = await registrations(event.活動ID).all({ fresh: true });
  const reg = regs.find((r) => isActive(r) && r.成員ID === clean(成員ID) && r.家庭ID === household.家庭ID);
  if (!reg) return { error: '找不到這位孩子的報名' };
  const member = (await members().all({ fresh: true })).find((m) => m.成員ID === reg.成員ID);
  if (!member) return { error: '找不到這位孩子的資料' };

  const { courses, counts, groups: gg, members: gm } = await loadCourseState(event.活動ID, rules, regs, true);
  const current = gm.filter((m) => m.報名ID === reg.報名ID && m.類型 === GroupType.Course && LEARNER_ROLES.includes(m.角色));
  for (const m of current) counts.set(m.分組ID, Math.max((counts.get(m.分組ID) ?? 1) - 1, 0));
  const ids = Array.from(new Set(courseIds.map(clean)));
  // 已報名的檢查略過（本人就是已報名），其餘資格條件與報名時相同
  const err = checkMember(
    { 成員ID: member.成員ID, 姓名: member.姓名, 年級: reg.年級 || member.年級, 生日: member.生日, courses: ids },
    rules,
    regs.filter((r) => r.報名ID !== reg.報名ID),
    courses,
    counts,
    { onSite, now: new Date() },
  );
  if (err) return { error: '無法修改課程', errors: [err] };

  const unchanged = current.length === ids.length && current.every((m) => ids.includes(m.分組ID));
  if (!unchanged) {
    const keep = new Set(current.filter((m) => ids.includes(m.分組ID)).map((m) => m.分組ID));
    const removed = current.filter((m) => !ids.includes(m.分組ID));
    if (removed.length) await groupMembers(event.活動ID).deleteByIds(removed.map((m) => m.分組成員ID));
    const now = nowString();
    await groupMembers(event.活動ID).append(
      ids
        .filter((id) => !keep.has(id))
        .map((分組ID) => ({
          分組成員ID: newId('分組成員ID'),
          分組ID,
          類型: GroupType.Course,
          成員ID: member.成員ID,
          姓名: member.姓名,
          報名ID: reg.報名ID,
          角色: GroupRole.Student,
          來源: '家長修改',
          建立時間: now,
        })),
    );
  }
  return { 課程: ids.map((id) => gg.find((g) => g.分組ID === id)?.名稱 ?? '').filter(Boolean).join('、'), 課程ID: ids };
}

/** 兒童報名的最低年齡（以送出當天計算）：滿 3 歲 6 個月 */
const MIN_AGE_MONTHS = 42;

/** 生日必填，且送出當天需滿 3.5 歲；回傳錯誤訊息（null 表示通過） */
function checkBirthday(m: MemberInput, today = new Date(Date.now() + 8 * 3600_000)): string | null {
  const name = m.姓名 || '（未填姓名）';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.生日)) return `${name}：請填寫生日`;
  const [y, mo, d] = m.生日.split('-').map(Number);
  // 滿 3 歲 6 個月的那一天（台北日期）
  const due = new Date(Date.UTC(y, mo - 1 + MIN_AGE_MONTHS, d));
  if (due.getTime() > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) return `${name}：需年滿 3.5 歲才能報名`;
  return null;
}

function cleanMember(m: MemberInput): MemberInput {
  return {
    成員ID: m.成員ID ? clean(m.成員ID) : undefined,
    姓名: clean(m.姓名),
    性別: m.性別 === '男' || m.性別 === '女' ? m.性別 : '',
    生日: clean(m.生日),
    年級: m.年級 ? normalizeGrade(m.年級) : '',
    學校: clean(m.學校),
    類型: m.類型 === MemberType.Adult ? MemberType.Adult : MemberType.Child,
    特殊需求: clean(m.特殊需求),
    courses: (m.courses ?? []).map(clean).filter(Boolean),
    selected: !!m.selected,
  };
}

export async function submitRegistration(payload: RegisterPayload): Promise<RegisterResult> {
  const event = await getEvent(payload.eventId);
  if (!event) return { error: '找不到活動' };
  const onSite = payload.source === RegistrationSource.OnSite;
  const window = registrationWindow(event);
  if (!window.open && !onSite) return { error: `目前無法報名：${window.reason}` };
  if (!payload.consent) return { error: '請勾選同意個人資料使用說明' };

  const rules = event.rules;
  const now = nowString();
  const selected = payload.members.map(cleanMember).filter((m) => m.selected);
  if (selected.length === 0) return { error: '請至少選擇一位報名者' };
  if (selected.some((m) => !m.姓名 || !m.性別 || !m.年級)) return { error: '每位報名者都需要填寫姓名、性別、年級' };

  const household = {
    主要聯絡人: clean(payload.household.主要聯絡人),
    電話: normalizePhone(payload.household.電話),
    Email: clean(payload.household.Email),
    地址: clean(payload.household.地址),
  };

  // ── 找到或建立家庭 ──
  let 家庭ID: string;
  let isNewHousehold = false;
  if (payload.mode === 'returning') {
    const found = await resolveReturningFamily(payload.lookup?.phone);
    if (!found) return { error: '家庭資料驗證已失效，請重新輸入手機與 PIN' };
    家庭ID = found.家庭ID;
  } else {
    if (rules.existingOnly) return { error: '本活動只開放已有資料的家庭報名' };
    if (!household.主要聯絡人 || !/^09\d{8}$/.test(household.電話)) return { error: '請填寫聯絡人姓名與正確的手機號碼（09 開頭 10 碼）' };
    if (await findHousehold(household.電話)) return { error: '此手機號碼已有家庭資料，請改用「家長登入」' };
    // 線上第一次報名要設定 PIN，下次才能帶入資料；同工現場代填可以先不設（家長之後用孩子的姓名與生日驗證再設定）
    if (payload.pin || !(onSite && isStaff())) {
      if (!isValidPin(payload.pin ?? '')) return { error: '請設定 4 位數字的 PIN，下次報名時用來帶入資料' };
      if (payload.pin !== payload.pinConfirm) return { error: '兩次輸入的 PIN 不一致' };
    }
    家庭ID = newId('家庭ID');
    isNewHousehold = true;
  }

  // ── 對應成員（既有成員只能是同一家庭的） ──
  const allMembers = await members().all({ fresh: true });
  const familyMembers = allMembers.filter((m) => m.家庭ID === 家庭ID);
  for (const m of selected) {
    if (m.成員ID && !familyMembers.some((f) => f.成員ID === m.成員ID)) return { error: '成員資料不符，請重新查詢' };
    if (!m.成員ID) {
      const sameName = familyMembers.find((f) => f.姓名 === m.姓名);
      if (sameName) m.成員ID = sameName.成員ID;
    }
  }

  // ── 資格檢查（全部通過才寫入） ──
  const regs = await registrations(event.活動ID).all({ fresh: true });
  const { courses, counts: courseCounts } = await loadCourseState(event.活動ID, rules, regs, true);
  // 同工現場報名：額滿課程可登記備取；備取的孩子只報這一門，不佔名額
  const staffOnSite = onSite && isStaff();
  const waitlisted = new Set<MemberInput>();
  const errors: string[] = [];
  for (const m of selected) {
    const birthdayError = m.類型 === MemberType.Child ? checkBirthday(m) : null;
    if (birthdayError) {
      errors.push(birthdayError);
      continue;
    }
    m.courses = Array.from(new Set(m.courses));
    const err = checkMember(m, rules, regs, courses, courseCounts, { onSite, now: new Date(), allowWaitlist: staffOnSite });
    if (err) errors.push(err);
    if (staffOnSite && m.courses.some((id) => { const g = courses.find((x) => x.分組ID === id); return !!g && isCourseFull(g, courseCounts); })) {
      waitlisted.add(m);
      continue;
    }
    for (const c of m.courses) courseCounts.set(c, (courseCounts.get(c) ?? 0) + 1);
  }
  if (errors.length > 0) return { error: '有報名者不符合資格', errors };

  // ── 寫入 ──
  if (isNewHousehold) {
    await households().ensure();
    await households().append([
      { 家庭ID, ...household, 建立時間: now, 更新時間: now, PIN雜湊: payload.pin ? hashPin(payload.pin) : '', PIN錯誤次數: '', PIN鎖定至: '' },
    ]);
  } else {
    // 既有家庭可更新 Email / 地址
    const changes: Record<string, string> = { 更新時間: now };
    if (household.Email) changes.Email = household.Email;
    if (household.地址) changes.地址 = household.地址;
    await households().updateByIds([{ id: 家庭ID, changes }]);
  }

  const newMembers = selected.filter((m) => !m.成員ID);
  for (const m of newMembers) m.成員ID = newId('成員ID');
  await members().append(
    newMembers.map((m) => ({
      成員ID: m.成員ID!,
      家庭ID,
      姓名: m.姓名,
      性別: m.性別,
      生日: m.生日,
      年級: m.年級,
      學校: m.學校,
      類型: m.類型,
      特殊需求: m.特殊需求,
      建立時間: now,
      更新時間: now,
    })),
  );
  const updated = selected.filter((m) => !newMembers.includes(m));
  await members().updateByIds(
    updated.map((m) => ({
      id: m.成員ID!,
      changes: { 年級: m.年級, 學校: m.學校, 生日: m.生日, 特殊需求: m.特殊需求, 更新時間: now },
    })),
  );

  const type = isNewHousehold
    ? RegistrationType.FirstTime
    : selected.length > 1
      ? RegistrationType.Household
      : RegistrationType.General;
  let serial = nextSerial(regs);
  let active = regs.filter(isActive).length;
  // 現場收費：每位孩子的金額＝所選課程的材料費合計（備取的孩子不收）
  const feeOf = (m: MemberInput) => m.courses.reduce((sum, id) => sum + (Number(courses.find((c) => c.分組ID === id)?.材料費) || 0), 0);
  const collector = staffOnSite ? currentStaffName() : '';
  const rows = selected.map((m) => ({
    報名ID: newId('報名ID'),
    序號: String(serial++),
    成員ID: m.成員ID!,
    家庭ID,
    姓名: m.姓名,
    年級: m.年級,
    報名類型: type,
    狀態: waitlisted.has(m) ? RegistrationStatus.Waitlist : initialStatus(rules, active++),
    來源: onSite ? RegistrationSource.OnSite : RegistrationSource.Online,
    報名時間: now,
    備註: '',
    照片影片公開同意: payload.photoConsent ? '同意' : '不同意',
    後續活動通知同意: payload.followUpConsent ? '同意' : '不同意',
    ...(staffOnSite && payload.paid && !waitlisted.has(m)
      ? { 繳費狀態: PaymentStatus.Paid, 繳費金額: String(feeOf(m)), 繳費時間: now, 收款人: collector }
      : { 繳費狀態: PaymentStatus.Unpaid, 繳費金額: '', 繳費時間: '', 收款人: '' }),
  }));
  // 繳費欄位是後來加的，現場報名寫入前先確認欄位存在
  if (staffOnSite) await registrations(event.活動ID).ensure();
  await registrations(event.活動ID).append(rows);
  // 家長自己第一次報名完成：直接登入，之後回到「家長登入」不用再輸入 PIN（同工現場代填不登入）
  if (isNewHousehold && payload.pin && !(onSite && isStaff())) signInFamily(家庭ID, !!payload.remember);
  // 選課寫入分組成員（每人每門課一列）
  await groupMembers(event.活動ID).append(
    selected.flatMap((m, i) =>
      m.courses.map((分組ID) => ({
        分組成員ID: newId('分組成員ID'),
        分組ID,
        類型: GroupType.Course,
        成員ID: m.成員ID!,
        姓名: m.姓名,
        報名ID: rows[i].報名ID,
        角色: waitlisted.has(m) ? GroupRole.Waitlist : GroupRole.Student,
        來源: '報名',
        建立時間: now,
      })),
    ),
  );
  return { ids: rows.map((r) => r.報名ID) };
}
