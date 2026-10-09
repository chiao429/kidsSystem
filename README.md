# kidsSystem 兒童活動管理平台

由五個**獨立**系統組成，資料存放於 Google Sheets。系統之間不互相呼叫，只透過試算表資料交換（規則見 [ARCHITECTURE.md](ARCHITECTURE.md)）。

```
kidsSystem/
├── apps/                    每個系統一個資料夾，可獨立開發、部署
│   ├── registration/  :3001 報名系統：第一次/曾報名/同戶報名、資格規則、報到 QR、問卷填寫、舊資料匯入
│   ├── checkin/       :3002 報到系統：搜尋/QR 報到、課程報到、第一次報到補資料、儀表板
│   ├── rollcall/      :3003 點名系統：小隊/時段點名、出席統計、CSV 報表
│   ├── admin/         :3004 系統管理後台：活動與規則、帳號、時間表、報名狀態、問卷、報表、日誌
│   └── data-tools/    :3005 資料整理：年級分組、家庭/手足、自動分隊、Excel 匯出
├── packages/
│   ├── schema/              資料契約：分頁名稱、欄位、狀態值、ID、年級、報名規則、問卷格式
│   ├── sheets-core/         Google Sheets 存取（依標題讀寫、依 ID 更新、快取）＋本機 JSON 後端
│   ├── auth/                登入（帳號分頁）、session cookie、角色檢查
│   └── ui/                  共用外觀元件
└── scripts/
    ├── check-boundaries.mjs 檢查 app 之間沒有互相 import
    └── make-sample-legacy.mjs 產生假的舊報名資料（本機測試匯入）
```

## 使用流程

1. **admin**：初始化主資料 → 建立帳號 → 新增活動（設定報名規則、課程、名額；同時建立活動試算表分頁）
2. **registration**：家長線上報名；或工作人員到 `/import` 匯入舊報名表（Excel / Google Sheet）
3. **admin**：調整報名狀態（正取/備取/待審核）
4. **data-tools**：檢視年級分組與手足 → 自動分隊、加入小隊長 → 匯出小隊名單、行前通知
5. **admin**：排時間表（可匯入舊版 `groupSchedule.json`）、建立問卷
6. **checkin**：活動當天報到（掃 QR / 搜尋），儀表板追蹤未到與聯繫
7. **rollcall**：小隊長用手機依時段點名
8. **admin**：報表與匯出、問卷結果

## 角色

| 角色 | 可用系統 |
|---|---|
| admin（管理員） | 全部，含帳號管理、新增活動 |
| manager（活動負責人） | 被指派活動的 admin / data-tools / registration 匯入 / checkin / rollcall |
| staff（同工） | checkin、rollcall（只看得到自己負責的小隊） |

家長不需登入（報名、問卷）。

## 本機開發（不需 Google 憑證）

```bash
npm install
```

每個 app 建立 `apps/<name>/.env.local`（參考 `.env.example`）：

```
SHEETS_LOCAL_DIR=../../.local-sheets
GOOGLE_MASTER_SHEET_ID=master
AUTH_SECRET=<至少 16 字元的亂數，五個 app 相同>
ADMIN_BOOTSTRAP_PASSWORD=<初始管理員密碼>
NEXT_PUBLIC_REGISTRATION_URL=http://localhost:3001
NEXT_PUBLIC_CHECKIN_URL=http://localhost:3002
```

```bash
npm run dev:admin        # http://localhost:3004 以 admin / ADMIN_BOOTSTRAP_PASSWORD 登入
npm run dev:registration # 其他 app 依此類推
node scripts/make-sample-legacy.mjs .local-sheets   # 產生假資料，在報名系統 /import 以「試算表連結 = legacy-sample、分頁 = 報名」匯入
```

`.local-sheets/` 下每個 JSON 檔就是一份「試算表」，五個 app 共用。

## 正式環境（Google Sheets）

1. Google Cloud 建立 service account，啟用 Google Sheets API，下載金鑰
2. 建立一份空白試算表當「主資料」，每場活動再各建一份空白試算表
3. 所有試算表都「共用」給 service account 的 email（編輯者）
4. 環境變數（每個 app 都要）：

| 變數 | 說明 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | service account email |
| `GOOGLE_PRIVATE_KEY` | 金鑰中的 private_key（換行以 `\n` 表示） |
| `GOOGLE_MASTER_SHEET_ID` | 主資料試算表 ID |
| `AUTH_SECRET` | 登入 cookie 簽章用，至少 16 字元 |
| `ADMIN_BOOTSTRAP_PASSWORD` | 只在帳號分頁還沒有 admin 時有效，建立正式 admin 帳號後可移除 |
| `NEXT_PUBLIC_REGISTRATION_URL` | 報名系統網址（報名完成頁、問卷連結、現場報名按鈕） |
| `NEXT_PUBLIC_CHECKIN_URL` | 報到系統網址（現場報名後返回） |

5. 登入 admin →「初始化」建立主資料分頁 → 建立正式 admin 帳號

### 部署到 Vercel

每個 app 建立一個 Vercel 專案，Root Directory 設為 `apps/<name>`（Vercel 會自動從 repo 根目錄安裝 workspaces）。

## 檢查

```bash
npm run check:boundaries   # app 之間不可互相 import
npm run typecheck
npm run build
```

## 容量

設計目標：單場 ≤300 人、報到裝置 ≤5 台、報名不搶名額。Sheets API 約每分鐘 60 讀 / 60 寫（每個 service account），讀取有快取、寫入以批次為主。
