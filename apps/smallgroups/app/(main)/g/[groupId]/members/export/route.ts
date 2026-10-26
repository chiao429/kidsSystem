import * as XLSX from 'xlsx';
import { requireSession } from '@kids/auth/next';
import { getGroup, kidDirectory, rosterOn, today } from '@/lib/data';
import { MEMBER_COLUMNS } from '@/lib/member-sheet';

export const dynamic = 'force-dynamic';

/** 匯出組員（?template=1 下載範例檔：欄位說明＋一筆範例） */
export async function GET(req: Request, { params }: { params: { groupId: string } }) {
  const session = requireSession({ permission: 'smallgroups' });
  const group = await getGroup(session, params.groupId);
  const template = new URL(req.url).searchParams.get('template') === '1';
  const wb = XLSX.utils.book_new();
  let rows: string[][];
  if (template) {
    rows = [[...MEMBER_COLUMNS], ['王小明', group.基地 === '夢夢' ? '中班' : '三年級', '王大明', '0912345678', '']];
  } else {
    const [roster, kids] = await Promise.all([rosterOn(group.小組ID, today()), kidDirectory()]);
    rows = [
      [...MEMBER_COLUMNS],
      ...roster.map((m) => {
        const k = kids.get(m.成員ID);
        return [k?.姓名 || m.姓名, k?.年級 ?? '', k?.家長 ?? '', k?.電話 ?? '', m.成員ID];
      }),
    ];
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, '組員');
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['欄位', '說明'],
      ['姓名', '必填。孩子的全名，需和家庭資料相同'],
      ['年級', '選填，只供參考，匯入時不會修改孩子的年級'],
      ['家長', '選填，只供參考'],
      ['家長電話', '建議填寫。同名的孩子用家長手機號碼區分'],
      ['成員ID', '選填。從「匯出組員」下載的檔案會帶這個欄位，有填就直接用它比對'],
      ['', ''],
      ['注意', `只能匯入${group.基地}基地的孩子；已在其他小組的孩子會換到這個小組（原本的點名紀錄保留）。檔案裡沒有的組員不會被移出。`],
    ]),
    '說明',
  );
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  const name = `${group.名稱}_${template ? '組員匯入範例' : `組員_${today().replace(/-/g, '')}`}.xlsx`;
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
