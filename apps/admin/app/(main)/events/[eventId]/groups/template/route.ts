import { COURSE_IMPORT_HEADERS } from '@/lib/course-import';
import { csvResponse } from '@/lib/csv';

export function GET() {
  return csvResponse(
    [
      [...COURSE_IMPORT_HEADERS],
      ['角落活動', '學齡前', '示範課程', 'DEMO-01', '小班', '大班', '3.5', '6', '20', '50', '課程說明', '注意事項', '', '', '是', '1', '啟用'],
      ['欄位說明', '公開顯示的適用對象', '必填', '相同代碼會更新', '可空白', '可空白', '歲', '歲', '0 表示不限', '元', '公開說明', '注意事項', 'YYYY-MM-DDTHH:mm', 'YYYY-MM-DDTHH:mm', '是/否', '整數', '啟用/停用'],
    ],
    '課程匯入範本.csv',
  );
}
