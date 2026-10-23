# kidsSystem 兒童活動管理平台

由五個**獨立**系統組成。正式資料存放在 MongoDB（`DATA_BACKEND=mongo`），Google Sheets 為自動同步的鏡像（部分欄位可在 Sheet 上修改並寫回）；未設定時仍可直接讀寫 Google Sheets。系統之間不互相呼叫，只透過共用的資料表交換資料，並由資料層強制檢查讀寫權責（規則見 [ARCHITECTURE.md](ARCHITECTURE.md)）。

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
│   ├── sheets-core/         資料存取（MongoDB / Google Sheets / 本機 JSON）、權責檢查、Sheet 鏡像同步、搬遷
│   ├── auth/                登入（帳號分頁）、session cookie、角色檢查
│   └── ui/                  共用外觀元件
└── scripts/
    ├── check-boundaries.mjs 檢查 app 之間沒有互相 import
    ├── make-sample-legacy.mjs 產生假的舊報名資料（本機測試匯入）
    ├── migrate.mjs          Google Sheets / 本機 JSON → MongoDB 搬遷（預設只預覽）
    ├── sync.mjs             觸發一次 MongoDB → Google Sheet 同步
    └── apps-script/Sync.gs  Google Apps Script：定時同步、Sheet 修改寫回
```

## 使用流程

1. **admin**：初始化主資料 → 建立帳號 → 新增活動（設定報名規則、名額、啟用的分組類型：小隊／課程）→ 在活動的「分組」頁建立課程（名額、代碼）並指派老師
2. **registration**：家長線上報名；或工作人員到 `/import` 匯入舊報名表（Excel / Google Sheet）
3. **admin**：調整報名狀態（正取/備取/待審核）
4. **data-tools**：檢視年級分組與手足 → 自動分隊、加入小隊長 → 匯出小隊名單、行前通知（admin 的「小隊」頁也可調整隊員）
5. **admin**：排時間表（可匯入舊版 `groupSchedule.json`）、建立問卷
6. **checkin**：活動當天報到（掃 QR / 搜尋），儀表板追蹤未到與聯繫
7. **rollcall**：小隊長／老師用手機依時段點名（小隊與課程可同時存在）
8. **admin**：報表與匯出（含「分組成員明細」長格式，可直接樞紐分析）、問卷結果；「家庭」頁修正家庭與成員資料

## 角色

| 角色 | 可用系統 |
|---|---|
| admin（管理員） | 全部，含帳號管理、新增活動 |
| manager（活動負責人） | 被指派活動的 admin / data-tools / registration 匯入 / checkin / rollcall |
| staff（同工） | checkin、rollcall（只看得到自己負責的分組：在「分組」被指派為小隊長／老師，或帳號的舊「小隊」欄） |

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
NEXT_PUBLIC_CHECKIN_URL=http://localhost:3001/checkin
NEXT_PUBLIC_SITE_URL=http://localhost:3001
SITE_HOST=localhost:3001
```

registration 另外設定 `ADMIN_ORIGIN=http://localhost:3004`、`CHECKIN_ORIGIN=http://localhost:3002`、`ROLLCALL_ORIGIN=http://localhost:3003`、`DATA_TOOLS_ORIGIN=http://localhost:3005`。

```bash
npm run dev              # 一次啟動五個 app，從 http://localhost:3001 進入（/staff 為同工入口）
npm run dev -- --only admin,registration
npm run dev:admin        # 也可單獨啟動，例如 http://localhost:3004/admin
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
| `NEXT_PUBLIC_REGISTRATION_URL` | 報名系統網址（報名完成頁、問卷連結、現場報名按鈕）；統一入口下為入口網址 |
| `NEXT_PUBLIC_CHECKIN_URL` | 報到系統網址（現場報名後返回）；統一入口下為 `<入口>/checkin` |
| `NEXT_PUBLIC_SITE_URL` | 統一入口網址 |
| `SITE_HOST` | 統一入口主機名稱（Server Action 允許來源，可逗號分隔） |

5. 登入 admin →「初始化」建立主資料分頁 → 建立正式 admin 帳號

## MongoDB 與 Google Sheet 鏡像

設定 `DATA_BACKEND=mongo` 後：

- 所有讀寫改走 MongoDB（`MONGODB_URI`、`MONGODB_DB`，五個 app 相同）
- Google Sheet 由 admin 定時推送（MongoDB → Sheet），只有變動的表會重寫；`帳號.密碼雜湊` 不會推送
- Sheet 上可修改並寫回的欄位：家庭（聯絡人、電話、Email、地址）、成員（姓名、性別、生日、年級、學校、類型、特殊需求）、報名（狀態、備註）、分組成員（分組名稱、角色）。其他欄位會被保護（僅警告），修改會在下次同步被覆蓋
- Sheet 修改前的值與系統不同時視為衝突，不寫入，列在 admin「初始化」頁

admin 額外環境變數：`SYNC_TOKEN`（同步）、`MIGRATE_TOKEN`（搬遷，完成後移除）。

### 同步觸發（Google Apps Script）

1. 到 script.google.com 建立獨立專案，貼上 `scripts/apps-script/Sync.gs`
2. 專案設定 → Script Properties：`ADMIN_BASE_URL`（後台網址）、`SYNC_TOKEN`
3. 執行 `setup()` 一次並授權：建立每 5 分鐘的 `tick()`、為主資料與進行中活動的試算表安裝編輯觸發
4. 本機或其他排程器也可執行 `SYNC_TOKEN=... node scripts/sync.mjs`

### 搬遷

```bash
MIGRATE_TOKEN=... node scripts/migrate.mjs --source sheets            # 預覽全部
MIGRATE_TOKEN=... node scripts/migrate.mjs --source sheets --event kids10-09
MIGRATE_TOKEN=... node scripts/migrate.mjs --source sheets --apply    # 正式寫入
```

`--source local` 從 `SHEETS_LOCAL_DIR` 搬遷。舊格式（報名.課程、小隊分頁、報到.課程、點名.小隊、時間表.小隊）會轉成分組模型；重跑不會重複，也不會覆寫切換後已修改的資料。正式切換步驟見 [docs/cutover.md](docs/cutover.md)。

> sheets 模式升級到這個版本時，請在 admin 對每場活動按「建立 / 檢查分頁」補上分組、分組成員分頁，並用搬遷工具或手動方式把舊課程設定轉成分組。

### 部署到 GCP（Cloud Run，自動 CI/CD）

push 到 `main` 自動部署 staging，推送 `v*` tag 部署 production（`.github/workflows/deploy.yml`，根目錄 `Dockerfile` 五個 app 共用）。首次設定步驟見 [docs/gcp-setup.md](docs/gcp-setup.md)。

### 部署到 Vercel

每個 app 建立一個 Vercel 專案，Root Directory 設為 `apps/<name>`（Vercel 會自動從 repo 根目錄安裝 workspaces）。

統一入口（一個網址）：

| 路徑 | 系統 |
|---|---|
| `/`、`/e/...`、`/login`、`/import`、`/staff` | registration（root zone，綁定自訂網域） |
| `/admin/...` | admin |
| `/checkin/...` | checkin |
| `/rollcall/...` | rollcall |
| `/data-tools/...` | data-tools |

1. 只有 registration 綁定自訂網域；其他四個專案保留 `*.vercel.app` 網址
2. registration 設定 `ADMIN_ORIGIN`、`CHECKIN_ORIGIN`、`ROLLCALL_ORIGIN`、`DATA_TOOLS_ORIGIN` 為各專案的 `https://*.vercel.app`
3. 五個專案的 `AUTH_SECRET` 必須相同（共用登入：任一系統登入即全部有效，任一系統登出即全部登出），`SITE_HOST` 設為自訂網域
4. `NEXT_PUBLIC_CHECKIN_URL` 改為 `https://<網域>/checkin`；已印出的舊 QR 只含報名ID，若有指向舊報到網址的連結，請保留舊的 checkin Vercel 網址
5. 登入的角色、可管理活動、小隊是登入當下的快照；在後台修改帳號權限後，需重新登入（或 12 小時後 session 到期）才生效

## 檢查

```bash
npm run check:boundaries   # app 之間不可互相 import
npm run typecheck
npm run build
```

## 容量

設計目標：單場 ≤500 人、尖峰約每秒 100 次操作（`DATA_BACKEND=mongo`）。報到與點名以唯一索引防止重複紀錄。Google Sheets 只承擔鏡像同步（每 5 分鐘、只重寫有變動的表）。sheets 模式下仍受 Sheets API 約每分鐘 60 讀 / 60 寫限制。
