#!/usr/bin/env node
/**
 * 一次啟動六個 app（本機從 http://localhost:3001 進入統一入口）。
 *
 *   npm run dev
 *   npm run dev -- --only admin,checkin
 *
 * 不包含搬遷、同步或任何初始化資料的動作。
 */
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';

const APPS = ['registration', 'checkin', 'rollcall', 'admin', 'data-tools', 'smallgroups'];
const COLORS = [32, 34, 33, 35, 36, 92];

const { values } = parseArgs({ options: { only: { type: 'string' } } });
const selected = values.only ? values.only.split(',').map((s) => s.trim()).filter(Boolean) : APPS;
const unknown = selected.filter((a) => !APPS.includes(a));
if (unknown.length) {
  console.error(`未知的 app：${unknown.join(', ')}（可用：${APPS.join(', ')}）`);
  process.exit(1);
}

const children = new Map();
const tails = new Map();
let stopping = false;

function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500).unref();
}

for (const [i, app] of selected.entries()) {
  const prefix = `\x1b[${COLORS[APPS.indexOf(app) % COLORS.length]}m[${app}]\x1b[0m `;
  const child = spawn('npm', ['run', 'dev', '-w', `@kids/${app}`], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  children.set(app, child);
  tails.set(app, []);
  const onData = (buf) => {
    for (const line of buf.toString().split(/\r?\n/)) {
      if (!line) continue;
      process.stdout.write(prefix + line + '\n');
      const t = tails.get(app);
      t.push(line);
      if (t.length > 20) t.shift();
    }
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    console.error(`\n${prefix}已結束（exit code ${code ?? signal}）。最後輸出：\n${tails.get(app).join('\n')}\n`);
    stopAll(code || 1);
  });
  if (i === 0) console.log(`啟動：${selected.join(', ')}（Ctrl+C 結束全部）`);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
