import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSetting } from '@kids/sheets-core';

/** 推播目標的 LINE 群組 ID：機器人加入群組時由 webhook 記下，或在「LINE 統計」頁手動填；本機可用環境變數 LINE_GROUP_ID */
export const LINE_GROUP_KEY = 'lineGroupId';
export const lineGroupId = () => getSetting(LINE_GROUP_KEY, 'LINE_GROUP_ID');

export const lineConfigured = () => !!process.env.LINE_CHANNEL_ACCESS_TOKEN;

/** 驗證 LINE webhook 簽章（X-Line-Signature＝以 Channel secret 對內容做 HMAC-SHA256 的 base64） */
export function verifyLineSignature(body: string, signature: string | null): boolean {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(body).digest('base64'));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** 推播文字訊息到群組（Messaging API push） */
export async function pushLineText(to: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return { ok: false, error: '尚未設定 LINE_CHANNEL_ACCESS_TOKEN' };
  if (!to) return { ok: false, error: '尚未綁定 LINE 群組' };
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    // LINE 單則文字上限 5000 字
    body: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `LINE 回應 ${res.status}：${(await res.text()).slice(0, 300)}` };
}
