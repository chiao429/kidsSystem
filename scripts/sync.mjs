#!/usr/bin/env node
/**
 * 觸發一次 MongoDB → Google Sheet 同步（本機或其他排程器使用）。
 *
 *   node scripts/sync.mjs
 *
 * 環境變數：ADMIN_BASE_URL（預設 http://localhost:3004）、SYNC_TOKEN（與 admin 相同）
 */
const base = (process.env.ADMIN_BASE_URL || 'http://localhost:3004').replace(/\/+$/, '');
const token = process.env.SYNC_TOKEN;
if (!token) {
  console.error('請設定 SYNC_TOKEN（與 admin 的環境變數相同）');
  process.exit(1);
}
const res = await fetch(`${base}/api/sync/push`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
if (!res.ok) {
  console.error('同步失敗：', body.error ?? body);
  process.exit(1);
}
if (body.skipped) console.log('另一個同步正在進行，略過');
else {
  console.table(body.tables.map((t) => ({ 表: t.table, 範圍: t.scope, 列數: t.rows ?? '', 錯誤: t.error ?? '' })));
  if (body.remaining) console.log(`尚有 ${body.remaining} 組待同步，下次觸發時處理`);
}
