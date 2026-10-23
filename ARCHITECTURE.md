# 架構與解耦規則

## 規則

1. **app 之間不得互相 import**。`apps/*` 只能依賴 `packages/*`。
2. **系統之間只透過共用的資料表溝通**（`DATA_BACKEND=mongo` 時為同一個 MongoDB database；否則為 Google Sheets），不互相呼叫 API。Google Sheet 在 mongo 模式下是鏡像，不是正式資料。
3. `packages/` 只放「契約」與「基礎設施」，不放任何系統的業務邏輯：
   - `schema`：分頁/欄位定義、狀態值、ID 規則
   - `sheets-core`：資料存取（MongoDB / Sheets / 本機 JSON）、權責檢查；`/mirror`（Sheet 鏡像同步、寫回）與 `/migrate`（搬遷）只給 admin 使用
   - `auth`：密碼雜湊、登入 cookie、以「帳號」分頁驗證
   - `ui`：純外觀元件（按鈕、表單、外框），不含資料存取
4. 每張表只有 **owner** 系統可新增、刪除、取代列；其他系統只能讀，或只更新 `updatableBy` 中列出的欄位（定義在 `packages/schema/src/tables.ts`）。分組、分組成員依「類型」決定 owner（課程：admin／registration；小隊：data-tools／admin）。**這些規則由 `SheetTable` 在寫入時強制檢查**，違反會丟出「權限錯誤」；各 app 建立表時必須傳入自己的系統名稱。
5. 每個 app 的 `lib/tables.ts` 明列它用到哪些表，新增依賴時一併更新下表。
6. 一律**依標題名稱**讀寫、**依 ID** 更新，不依欄位位置或列號。活動資料以**活動ID**劃分範圍（`registrations(eventId)`），試算表 ID 只用來指定鏡像目的地。
7. 小隊與課程統一為「分組」：`分組`（類型 小隊｜課程）＋`分組成員`（每人每組一列，含負責人）。報到、點名、時間表都以 `分組ID` 關聯；名稱只在 Sheet 鏡像中計算顯示。

## 統一入口與登入

一個網址、五個獨立部署：registration 是 root zone，以 Next.js rewrites 把 `/admin`、`/checkin`、`/rollcall`、`/data-tools` 轉送到各自的專案（各設相同的 `basePath`）。

- 系統內連結用 `<Link>`／`redirect()`（自動加 basePath）；原生 `<a>`、匯出網址用 `@kids/ui` 的 `withBase()`；跨系統連結用原生 `<a href="/rollcall/...">`
- 登入 cookie `kids_session`（path `/`）五個系統共用；每個頁面、Server Action、Route Handler 仍各自以 `requireSession` 檢查角色與活動權限，未登入導向本系統 `/login?next=`，權限不符導向 `/forbidden`
- `next` 只接受站內路徑（`safeNext`）；登入成功由瀏覽器整頁導向，可回到其他系統

## 資料流

```
                 ┌──────────────┐
  Google Sheet ─▶│    admin     │ 建立活動、設定規則、帳號、時間表、問卷
  (舊資料匯入)    └──────┬───────┘
                        │ 活動
                        ▼
 家長 ─▶ ┌──────────────┐  報名/家庭/成員  ┌──────────────┐
        │ registration │ ───────────────▶ │  data-tools  │ 分組、分隊
        └──────┬───────┘                  └──────┬───────┘
               │ 報名                            │ 小隊
               ▼                                 ▼
        ┌──────────────┐      報到        ┌──────────────┐
 同工 ─▶ │   checkin    │ ───────────────▶ │   rollcall   │ ◀─ 小隊長
        └──────────────┘                  └──────────────┘
```

## 讀寫權責

| 分頁 | 位置 | registration | checkin | rollcall | admin | data-tools |
|---|---|---|---|---|---|---|
| 家庭 | 主資料 | **寫** | 讀(聯絡家長) | | 改 | 讀 |
| 成員 | 主資料 | **寫** | 改(特殊需求) | | 改 | 讀 |
| 帳號 | 主資料 | | | | **寫** | |
| 活動 | 主資料 | 讀 | 讀 | 讀 | **寫** | 讀 |
| 報名 | 活動 | **寫** | 讀 | 讀 | 改(狀態) | 讀 |
| 報到 | 活動 | | **寫** | 讀 | 讀 | |
| 分組 | 活動 | 讀 | 讀 | 讀 | **寫**(課程)、寫(小隊) | **寫**(小隊) |
| 分組成員 | 活動 | **寫**(課程學員) | 讀 | 讀 | 寫(全部) | **寫**(小隊) |
| 時間表 | 活動 | | 讀 | 讀 | **寫** | |
| 點名 | 活動 | | | **寫** | 讀 | |
| 問卷 | 活動 | 讀 | | | **寫** | |
| 問卷回覆 | 活動 | **寫** | | | 讀 | |
| 日誌 | 活動 | | 追加 | 追加 | **寫** | |

## 試算表

- **主資料試算表**（一份，`GOOGLE_MASTER_SHEET_ID`）：家庭、成員、帳號、活動
- **活動試算表**（每場一份，連結記在「活動」分頁的「活動試算表」欄）：報名、報到、分組、分組成員、時間表、點名、問卷、問卷回覆、日誌

mongo 模式下這些是鏡像：admin 依 `_dirty`／`_ver` 只推送有變動的表，並計算顯示欄（分組名稱、報名.課程）；`帳號.密碼雜湊` 不推送。可寫回的欄位定義在各表的 `sheetEditable`，由 Apps Script（`scripts/apps-script/Sync.gs`）送到 admin `/api/sync/edits`。

由 admin 的「初始化」功能建立分頁與標題列（`ensureMasterTables` / `ensureEventTables`）。

## 容量（單場 ≤500 人、尖峰約每秒 100 次操作）

- mongo 模式：讀取快取 2 秒；報到以（報名ID, 分組ID）、點名以（時段ID, 分組ID, 成員ID）唯一索引防止重複，寫入用 `upsertByKey`
- sheets 模式：Sheets API 每個 service account 每分鐘約 60 讀 / 60 寫，讀取快取 10 秒
- Sheet 鏡像：每 5 分鐘一次、只重寫有變動的表，以 `_sync_locks` 防止同時推送

## 開發注意事項

- **表單欄位 `name` 一律用英文**：Next 14 的 Server Action 會把非 ASCII 的欄位名稱以 latin1 解碼（值不受影響），中文 name 會讀不到。
- 本機開發可設定 `SHEETS_LOCAL_DIR`，以 JSON 檔模擬試算表，五個 app 指向同一個目錄即可互通資料。
