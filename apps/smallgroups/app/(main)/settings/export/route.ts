import { requireSession } from '@kids/auth/next';
import { listGroups, today } from '@/lib/data';
import { GROUP_COLUMNS } from '@/lib/member-sheet';
import { xlsxResponse } from '@/lib/xlsx-response';

export const dynamic = 'force-dynamic';

/** 匯出小組設定（也可當作匯入範例表：以目前的小組為範例） */
export async function GET() {
  requireSession({ permission: 'smallgroup-settings' });
  const groups = await listGroups();
  return xlsxResponse(
    `小組設定_${today().replace(/-/g, '')}.xlsx`,
    [[...GROUP_COLUMNS], ...groups.map((g) => [g.名稱, g.基地, g.排序, g.狀態 || '啟用', g.說明, g.負責人])],
    [
      ['小組名稱', '必填。名稱相同的小組會更新，沒有的會新增；檔案裡沒有的小組不會被刪除或停用'],
      ['基地', '必填，填「思麥特」或「夢夢」'],
      ['排序', '數字，越小越前面'],
      ['狀態', '啟用或停用'],
      ['說明', '選填'],
      ['負責人帳號', '選填，帳號以逗號分隔（例如 0912345678,leader1）；找不到的帳號會略過'],
    ],
    [14, 10, 6, 8, 24, 28],
  );
}
