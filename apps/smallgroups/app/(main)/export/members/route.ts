import { requireSession } from '@kids/auth/next';
import { kidDirectory, rosterOn, today, visibleGroups } from '@/lib/data';
import { ALL_MEMBER_COLUMNS } from '@/lib/member-sheet';
import { xlsxResponse } from '@/lib/xlsx-response';

export const dynamic = 'force-dynamic';

/** 匯出所有小組的組員；?template=1 下載範例表（用目前的小組名稱，每組一列範例） */
export async function GET(req: Request) {
  const session = requireSession({ permission: 'smallgroups' });
  const groups = await visibleGroups(session);
  const template = new URL(req.url).searchParams.get('template') === '1';
  let rows: string[][];
  if (template) {
    rows = [[...ALL_MEMBER_COLUMNS], ...groups.map((g) => [g.名稱, '王小明', g.基地 === '夢夢' ? '中班' : '三年級', '王大明', '0912345678', ''])];
  } else {
    const kids = await kidDirectory();
    rows = [[...ALL_MEMBER_COLUMNS]];
    for (const g of groups) {
      for (const m of await rosterOn(g.小組ID, today())) {
        const k = kids.get(m.成員ID);
        rows.push([g.名稱, k?.姓名 || m.姓名, k?.年級 ?? '', k?.家長 ?? '', k?.電話 ?? '', m.成員ID]);
      }
    }
  }
  const date = today().replace(/-/g, '');
  return xlsxResponse(
    template ? '小組組員匯入範例.xlsx' : `小組組員_${date}.xlsx`,
    rows,
    [
      ['小組名稱', `必填，要和「小組設定」的名稱相同（目前：${groups.map((g) => g.名稱).join('、')}）`],
      ['姓名', '必填。孩子的全名，需和家庭資料相同'],
      ['年級、家長', '選填，只供參考，匯入時不會修改'],
      ['家長電話', '建議填寫。同名的孩子用家長手機號碼區分'],
      ['成員ID', '選填。匯出的檔案會帶這個欄位，有填就直接用它比對'],
      ['注意', '孩子要和小組同一個基地；已在其他小組的會換過來（點名紀錄保留）；檔案裡沒有的組員不會被移出'],
    ],
    [14, 12, 8, 12, 14, 22],
  );
}
