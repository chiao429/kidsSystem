// 產生假的舊報名資料（本機測試匯入用），寫入 SHEETS_LOCAL_DIR 下的 legacy-sample.json，分頁「報名」
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.argv[2] ?? '.local-sheets');
const surnames = ['王', '李', '張', '陳', '林', '黃', '吳', '劉', '蔡', '楊'];
const given = ['小明', '小華', '小美', '安安', '樂樂', '宇辰', '品妍', '承恩', '語彤', '子睿', '芷晴', '柏宇'];
const grades = ['中班', '大班', '一年級', '二年級', '三年級', '四年級', '五年級', '六年級'];
const header = ['項次', '(收費同工)\n報名序號', '兒童姓名', '性別', '年級', '學校', '家長\n姓名', '家長\n行動電話', '備註'];
const rows = [header];
let n = 1;
for (let f = 0; f < 18; f++) {
  const sur = surnames[f % surnames.length];
  const kids = f % 4 === 0 ? 2 : f % 7 === 0 ? 3 : 1;
  const phone = `09${String(10000000 + f * 7919).slice(0, 8)}`;
  for (let k = 0; k < kids; k++) {
    const serial = String(n).padStart(3, '0') + (n === 5 ? '(取消）' : '');
    rows.push([
      String(n),
      serial,
      sur + given[(f * 3 + k) % given.length],
      (f + k) % 2 ? '女' : '男',
      grades[(f + k * 2) % grades.length],
      '測試國小',
      sur + '家長',
      phone,
      k === 1 ? '對花生過敏' : '',
    ]);
    n++;
  }
}
mkdirSync(dir, { recursive: true });
writeFileSync(path.join(dir, 'legacy-sample.json'), JSON.stringify({ 報名: rows }, null, 1));
console.log(`寫入 ${rows.length - 1} 筆假資料到 ${path.join(dir, 'legacy-sample.json')}`);
