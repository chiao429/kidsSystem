'use server';

import {
  GroupRole,
  GroupType,
  MemberType,
  RegistrationSource,
  RegistrationType,
  newId,
  normalizeGrade,
  normalizePhone,
  nowString,
} from '@kids/schema';
import { checkMember, initialStatus, isActive, loadCourseState, nextSerial } from './eligibility';
import { getEvent, registrationWindow } from './events';
import { groupMembers, households, members, registrations } from './tables';
import type { LookupResult, MemberInput, RegisterPayload, RegisterResult } from './types';

const clean = (v: unknown) => String(v ?? '').trim().slice(0, 200);

async function findHousehold(phone: string, name: string) {
  const p = normalizePhone(phone);
  const n = clean(name);
  if (!p || !n) return null;
  const all = await households().all({ fresh: true });
  return all.find((h) => normalizePhone(h.電話) === p && h.主要聯絡人.trim() === n) ?? null;
}

export async function lookupHousehold(eventId: string, phone: string, name: string): Promise<LookupResult> {
  const event = await getEvent(eventId);
  if (!event) return { error: '找不到活動' };
  const household = await findHousehold(phone, name);
  if (!household) return { error: '查無資料，請確認電話與聯絡人姓名，或改用「第一次報名」' };

  const [allMembers, regs] = await Promise.all([members().all(), registrations(event.活動ID).all()]);
  const registered = new Set(regs.filter(isActive).map((r) => r.成員ID));
  return {
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
      })),
  };
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
  if (payload.lookup) {
    const found = await findHousehold(payload.lookup.phone, payload.lookup.name);
    if (!found) return { error: '家庭資料驗證失敗，請重新查詢' };
    家庭ID = found.家庭ID;
  } else {
    if (rules.existingOnly) return { error: '本活動只開放已有資料的家庭報名' };
    if (!household.主要聯絡人 || !/^09\d{8}$/.test(household.電話)) return { error: '請填寫聯絡人姓名與正確的手機號碼（09 開頭 10 碼）' };
    const dup = (await households().all({ fresh: true })).some((h) => normalizePhone(h.電話) === household.電話);
    if (dup) return { error: '此手機號碼已有家庭資料，請改用「曾經報名過」' };
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
  const errors: string[] = [];
  for (const m of selected) {
    m.courses = Array.from(new Set(m.courses));
    const err = checkMember(m, rules, regs, courses, courseCounts);
    if (err) errors.push(err);
    for (const c of m.courses) courseCounts.set(c, (courseCounts.get(c) ?? 0) + 1);
  }
  if (errors.length > 0) return { error: '有報名者不符合資格', errors };

  // ── 寫入 ──
  if (isNewHousehold) {
    await households().append([{ 家庭ID, ...household, 建立時間: now, 更新時間: now }]);
  } else if (payload.lookup) {
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
  const rows = selected.map((m) => ({
    報名ID: newId('報名ID'),
    序號: String(serial++),
    成員ID: m.成員ID!,
    家庭ID,
    姓名: m.姓名,
    年級: m.年級,
    報名類型: type,
    狀態: initialStatus(rules, active++),
    來源: onSite ? RegistrationSource.OnSite : RegistrationSource.Online,
    報名時間: now,
    備註: '',
  }));
  await registrations(event.活動ID).append(rows);
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
        角色: GroupRole.Student,
        來源: '報名',
        建立時間: now,
      })),
    ),
  );
  return { ids: rows.map((r) => r.報名ID) };
}
