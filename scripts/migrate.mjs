#!/usr/bin/env node
/**
 * 搬遷 Google Sheets（或本機 JSON）→ MongoDB。預設只預覽，加 --apply 才寫入。
 *
 *   node scripts/migrate.mjs --source sheets [--event kids10-09]... [--apply]
 *
 * 環境變數：ADMIN_BASE_URL（預設 http://localhost:3004）、MIGRATE_TOKEN（與 admin 相同）
 */
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    source: { type: 'string', default: 'sheets' },
    event: { type: 'string', multiple: true },
    apply: { type: 'boolean', default: false },
  },
});

const base = (process.env.ADMIN_BASE_URL || 'http://localhost:3004').replace(/\/+$/, '');
const token = process.env.MIGRATE_TOKEN;
if (!token) {
  console.error('請設定 MIGRATE_TOKEN（與 admin 的環境變數相同）');
  process.exit(1);
}
if (!['sheets', 'local'].includes(values.source)) {
  console.error('--source 必須是 sheets 或 local');
  process.exit(1);
}

console.log(`${values.apply ? '⚠️  正式搬遷' : '預覽（不寫入）'}：source=${values.source} events=${values.event?.join(',') || '全部'}`);
const res = await fetch(`${base}/api/migrate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ source: values.source, eventIds: values.event, apply: values.apply }),
});
const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
if (!res.ok) {
  console.error('失敗：', body.error ?? body);
  process.exit(1);
}

console.log('\n筆數：');
console.table(body.counts.map((c) => ({ 範圍: c.scope, 分頁: c.tab, 筆數: c.rows })));
if (body.issues.length === 0) {
  console.log('沒有異常');
} else {
  console.log(`\n異常（${body.issues.length}）：`);
  console.table(body.issues.slice(0, 200).map((i) => ({ 範圍: i.scope, 分頁: i.tab, ID: i.id, 問題: i.problem })));
  if (body.issues.length > 200) console.log(`…另有 ${body.issues.length - 200} 筆`);
}
console.log(body.applied ? '\n✅ 已寫入 MongoDB' : '\n（預覽模式，未寫入。確認無誤後加 --apply）');
