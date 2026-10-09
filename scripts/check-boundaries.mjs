// 檢查 apps 之間沒有互相 import（解耦規則 #1）
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const apps = readdirSync(join(root, 'apps'));
const violations = [];

function walk(dir, app) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, app);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) {
      const src = readFileSync(p, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const spec = m[1];
        const other = apps.find((a) => a !== app && (spec === `@easyevent/${a}` || spec.includes(`apps/${a}`) || spec.includes(`../${a}/`)));
        if (other) violations.push(`${relative(root, p)} → ${spec}`);
      }
    }
  }
}

for (const app of apps) walk(join(root, 'apps', app), app);

if (violations.length) {
  console.error('❌ apps 之間不可互相 import：\n' + violations.join('\n'));
  process.exit(1);
}
console.log('✅ 沒有跨 app 的 import');
