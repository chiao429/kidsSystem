# AGENTS.md — 接手前先讀這頁

兒童活動管理平台。npm workspaces monorepo，6 個 Next.js 14（App Router、Server Actions、Tailwind）app ＋ 4 個共用 package。介面與註解一律繁體中文。

## 結構

| 路徑 | 埠 | 做什麼 |
|---|---|---|
| `apps/registration` | 3001 | 家長報名、報到 QR、問卷填寫、舊資料匯入。**root zone**：用 rewrites 轉送其他 5 個 app |
| `apps/checkin` | 3002 | 活動當天報到（QR 掃描 / 搜尋）、儀表板 |
| `apps/rollcall` | 3003 | 小隊／課程依時段點名、統計 |
| `apps/admin` | 3004 | 活動、帳號、角色、分組、時間表、問卷、報表、Sheet 同步 |
| `apps/data-tools` | 3005 | 自動分隊、Excel 匯出 |
| `apps/smallgroups` | 3006 | 小組（長期、跨活動）點名：出席、當天狀況、備註；自動帶入當天報到的孩子。網址前綴 `/groups` |
| `packages/schema` | | **資料契約**：所有表的欄位、owner、狀態值、ID、角色（`src/tables.ts` 是核心） |
| `packages/sheets-core` | | 資料存取 `SheetTable`（MongoDB / Google Sheets / 本機 JSON） |
| `packages/auth` | | 登入、cookie `kids_session`、`requireSession` |
| `packages/ui` | | 純外觀元件、`withBase()` |

每個 app 長一樣：`app/`（頁面）、`components/`、`lib/tables.ts`（本 app 用到的表）、`lib/actions.ts`（Server Actions）、`middleware.ts`。

## 硬規則（違反 CI 會擋或執行時丟錯）

1. **app 之間不可互相 import**，只能依賴 `packages/*`（`npm run check:boundaries`）。
2. **app 之間不互相呼叫 API**，只透過共用資料表交換資料。
3. **寫入權限**：每張表有 owner（只有 owner 能新增/刪除列），其他 app 只能改 `updatableBy` 列出的欄位。定義在 `packages/schema/src/tables.ts`，`SheetTable` 寫入時強制檢查。要讓某 app 寫新欄位 → 改那裡。
4. 欄位一律用**中文標題名稱**存取、依 **ID** 更新；活動資料以 `eventId` 分範圍。
5. **表單 `name` 屬性必須是英文**（Next 14 Server Action 會把中文 name 解壞）。
6. 每個 Server Action / Route Handler / 頁面自己呼叫 `requireSession({ permission, eventId })` 檢查權限。
7. 連結：同 app 用 `<Link>`/`redirect()`；原生 `<a>` 或匯出網址用 `withBase()`；跨 app 用 `<a href="/rollcall/...">`。

## 資料存取範例

```ts
// apps/<app>/lib/tables.ts
export const checkIns = (eventId: string) => new SheetTable(eventId, CheckInTable, 'checkin', { ttlMs: 5_000 });

// 使用
await checkIns(eventId).all();
await checkIns(eventId).findById(id);
await checkIns(eventId).append([row]);
await checkIns(eventId).updateByIds([{ id, changes }]);
await checkIns(eventId).upsertByKey(['報名ID', '分組ID'], row); // 防重複
```

新 ID 用 `newId('xxID')`，時間用 `nowString()`（皆來自 `@kids/schema`）。

## 資料模型重點

- 主資料（跨活動）：家庭、成員、帳號、角色、活動
- 活動資料（每場一份）：報名、報到、分組、分組成員、時間表、點名、問卷、問卷回覆、日誌
- **小隊與課程都是「分組」**（`分組.類型` = 小隊｜課程），人員歸屬在「分組成員」。報到、點名、時間表都用 `分組ID` 關聯。
- 正式後端是 MongoDB（`DATA_BACKEND=mongo`）；Google Sheets 只是 admin 推送的鏡像。

## 角色

`packages/schema/src/roles.ts`：admin（全部）、manager（指派的活動）、staff（報到 + 只點名自己負責的分組）。家長不需登入。

## 本機開發

```bash
npm install
npm run dev                          # 六個一起，從 http://localhost:3001 進入
npm run dev -- --only admin,checkin  # 只開部分
```

每個 app 需要 `apps/<name>/.env.local`，本機設 `SHEETS_LOCAL_DIR=../../.local-sheets` 就不需要 Google/Mongo（`.local-sheets/*.json` 即資料）。完整變數見 README。

## 完成前必跑

```bash
npm run check:boundaries
npm run typecheck
```

## 部署

push `main` → Cloud Run staging（只部署有變動的 app）；推 `v*` tag → production。見 `.github/workflows/deploy.yml`。

## 想知道更多

- `ARCHITECTURE.md`：完整讀寫權責表、資料流、容量設計
- `README.md`：環境變數、Sheet 鏡像、搬遷、部署
- `ROADMAP.md`：待辦
