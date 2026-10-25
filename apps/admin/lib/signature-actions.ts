'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireSession } from '@kids/auth/next';
import { newId, nowString } from '@kids/schema';
import { sanitizeRichText } from '@kids/ui/rich-text';
import type { FormResult } from '@kids/ui/client';
import { getEvent } from './events';
import { writeLog } from './log';
import { SIGNATURE_NONE, listSignatures } from './signatures';
import { events, signatures } from './tables';

/** 簽名檔是所有活動共用的主資料：只有「所有活動」範圍的管理者可以修改 */
const manage = () => requireSession({ permission: 'signatures' });

export async function createSignature() {
  manage();
  const all = await listSignatures();
  const id = newId('簽名檔ID');
  const order = all.reduce((max, s) => Math.max(max, Number(s.排序) || 0), 0) + 1;
  // 第一個簽名檔自動成為預設
  await signatures().append([{ 簽名檔ID: id, 名稱: `簽名檔 ${all.length + 1}`, 內容: '', 預設: all.length ? '' : 'Y', 排序: String(order), 更新時間: nowString() }]);
  redirect(`/signatures/${id}`);
}

/** 簽名檔編輯頁的儲存；回傳消毒後的內容讓畫面與資料庫一致 */
export async function saveSignature(id: string, name: string, html: string): Promise<{ error?: string; html?: string }> {
  manage();
  const 名稱 = name.trim().slice(0, 50);
  if (!名稱) return { error: '請填寫簽名檔名稱' };
  const 內容 = sanitizeRichText(html);
  const { notFound } = await signatures().updateByIds([{ id, changes: { 名稱, 內容, 更新時間: nowString() } }]);
  if (notFound.length) return { error: '找不到此簽名檔，可能已被刪除' };
  revalidatePath('/signatures');
  return { html: 內容 };
}

export async function setDefaultSignature(id: string) {
  manage();
  const all = await listSignatures();
  if (!all.some((s) => s.簽名檔ID === id)) return;
  await signatures().updateByIds(all.map((s) => ({ id: s.簽名檔ID, changes: { 預設: s.簽名檔ID === id ? 'Y' : '' } })));
  revalidatePath('/signatures');
}

/** 刪除簽名檔：指定它的活動會改用預設簽名檔 */
export async function deleteSignature(id: string) {
  manage();
  const used = (await events().all({ fresh: true })).filter((e) => e.簽名檔 === id);
  if (used.length) await events().updateByIds(used.map((e) => ({ id: e.活動ID, changes: { 簽名檔: '' } })));
  await signatures().deleteByIds([id]);
  revalidatePath('/signatures');
  redirect('/signatures');
}

/** 活動說明分頁：選擇這場活動的簽名檔（空白＝預設、「無」＝不顯示） */
export async function setEventSignature(eventId: string, _: FormResult, formData: FormData): Promise<FormResult> {
  const session = requireSession({ permission: 'admin', eventId });
  const event = await getEvent(eventId);
  const choice = String(formData.get('signature') ?? '');
  const all = await listSignatures();
  if (choice && choice !== SIGNATURE_NONE && !all.some((s) => s.簽名檔ID === choice)) return { error: '找不到此簽名檔' };
  await events().ensure();
  await events().updateByIds([{ id: eventId, changes: { 簽名檔: choice } }]);
  await writeLog(event.活動ID, session, '設定簽名檔', eventId, choice ? (all.find((s) => s.簽名檔ID === choice)?.名稱 ?? '不使用') : '使用預設');
  revalidatePath(`/events/${eventId}/description`);
  return { message: '已套用' };
}
