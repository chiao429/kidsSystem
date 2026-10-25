import 'server-only';
import { signatures } from './tables';

/** 活動「簽名檔」欄位的特殊值 */
export const SIGNATURE_NONE = '無';

/** 全部簽名檔（依排序）；分頁還沒建立時先建立，舊資料也能直接使用 */
export async function listSignatures() {
  const table = signatures();
  await table.ensure();
  return (await table.all({ fresh: true })).sort((a, b) => (Number(a.排序) || 0) - (Number(b.排序) || 0));
}

type Signature = Awaited<ReturnType<typeof listSignatures>>[number];

/** 活動實際使用的簽名檔：指定的 → 預設的；「無」或找不到預設時為 undefined */
export function effectiveSignature(choice: string | undefined, all: Signature[]): Signature | undefined {
  if (choice === SIGNATURE_NONE) return undefined;
  return (choice && all.find((s) => s.簽名檔ID === choice)) || all.find((s) => s.預設 === 'Y');
}
