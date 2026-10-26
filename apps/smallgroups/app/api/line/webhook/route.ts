import { setSetting } from '@kids/sheets-core';
import { LINE_GROUP_KEY, verifyLineSignature } from '@/lib/line';

export const dynamic = 'force-dynamic';

/**
 * LINE webhook：機器人被加入群組（join）時記下群組 ID，作為推播目標。
 * 網址填在 LINE Developers 的 Webhook URL：<小組系統網址>/groups/api/line/webhook
 */
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyLineSignature(body, req.headers.get('x-line-signature'))) return new Response('invalid signature', { status: 401 });
  const events = (JSON.parse(body || '{}').events ?? []) as { type: string; source?: { type: string; groupId?: string } }[];
  for (const e of events) {
    if (e.type === 'join' && e.source?.type === 'group' && e.source.groupId) {
      await setSetting(LINE_GROUP_KEY, e.source.groupId, 'LINE 加入群組').catch((err) => console.error('[line webhook] 無法儲存群組 ID', err));
    }
  }
  return Response.json({ ok: true });
}
