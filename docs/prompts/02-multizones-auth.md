# 任務：kidsSystem 統一入口（Next.js Multi-Zones）＋共用登入＋一個指令啟動五個 app

請實際修改程式並依階段完成，不要只提供建議或範例。
本任務在 `01-mongodb-groups-sync.md` 完成後執行，不能更動資料層。

## 0. 工作限制

- 先閱讀 README.md、ARCHITECTURE.md，只檢查和任務直接相關的檔案。
- 工作樹裡已有未提交的修改：要保留，不能覆蓋或回退。
- 沿用 Next.js 14 App Router、@kids/ui、現有角色與業務規則；不升級套件，也不重構無關程式。
- 不新增依賴。如果真的需要，先說明理由並取得同意。
- 保留家長端路徑（`/`、`/e/[eventId]/...`）和已發出的 QR 內容。
- 不動資料層（packages/sheets-core、packages/schema 的表定義）。
- 不寫測試，不跑 build，不部署，不 commit，不 push。

### 型別檢查（允許，但要節省輸出）

- 只在每個階段結束時執行一次，只檢查受影響的 workspace，並截斷輸出：
  `npm run typecheck -w @kids/<name> 2>&1 | grep -E "error TS" | head -30`
- 全部完成後，整體只跑一次 `npm run typecheck 2>&1 | grep -E "error TS" | head -30`，另外跑 `npm run check:boundaries`。
- 不要把完整的輸出貼進回覆。

## 1. 背景（現況）

- 五個獨立的 Next.js 14 app：registration(3001)、checkin(3002)、rollcall(3003)、admin(3004)、data-tools(3005)。每個 app 是一個 Vercel 專案，目前都沒有 basePath，也沒有 middleware。
- `packages/auth/src/next.ts`：
  - cookie 名稱 `kids_session`，設定為 path '/'、httpOnly、正式環境 secure、sameSite lax。
  - `requireSession({ roles, eventId })`：未登入時 redirect('/login')；角色不符時 throw Error。
  - `loginWithForm(formData, allowedRoles, redirectTo='/')`
  - `logout()`：`cookies().delete` 後 redirect('/login')。
- 各 app 的 `app/login/page.tsx` 允許的角色：
  - admin、data-tools、registration(/import)：['admin','manager']
  - checkin、rollcall：['admin','manager','staff']
- 跨系統網址：
  - `NEXT_PUBLIC_CHECKIN_URL`：registration 完成頁的報到 QR
  - `NEXT_PUBLIC_REGISTRATION_URL`：admin 問卷 QR、checkin 看板

## 2. 目標

1. 只有一個網址（例如 https://kids.example.org）：

   | 路徑 | app |
   |---|---|
   | `/`、`/e/...`、`/login`、`/import`、`/staff` | registration（root zone） |
   | `/admin/...` | admin |
   | `/checkin/...` | checkin |
   | `/rollcall/...` | rollcall |
   | `/data-tools/...` | data-tools |

2. 五個 app 仍然可以獨立啟動、部署、更新。
3. 共用登入：在任一系統登入，五個系統都有效；在任一系統登出，全部都登出。
4. 每個頁面、Server Action、Route Handler 都保留原本的角色、活動範圍和 staff 小隊／分組限制。不能只靠入口或隱藏按鈕。
5. 根目錄執行 `npm run dev`，一次啟動五個 app。

## 3. Multi-Zones

### 3.1 員工端四個 app 的 next.config.js

- 固定 basePath：'/admin'、'/checkin'、'/rollcall'、'/data-tools'。
- 在 `env` 設定 `NEXT_PUBLIC_BASE_PATH`，值和 basePath 相同。
- 設定 `experimental.serverActions.allowedOrigins`：值從 `SITE_HOST` 讀取，可以用逗號分隔多個（例如 `kids.example.org,localhost:3001`）。不能用萬用字元。
  原因：經過 rewrite 後 Origin 和 Host 不一致，Next 14 會拒絕 Server Action。

### 3.2 registration（root zone）的 next.config.js

- 不設定 basePath。
- `rewrites()` 回傳 `beforeFiles`，對四個 zone 各設兩條規則：
  - `/admin` → `${ADMIN_ORIGIN}/admin`
  - `/admin/:path*` → `${ADMIN_ORIGIN}/admin/:path*`
- 環境變數：ADMIN_ORIGIN、CHECKIN_ORIGIN、ROLLCALL_ORIGIN、DATA_TOOLS_ORIGIN。正式環境填 *.vercel.app 網址，本機填 http://localhost:300x。沒設定的 zone 就不加入規則。
- 有 basePath 之後，靜態資源路徑是 `/checkin/_next/...`，已被 `/checkin/:path*` 涵蓋，不用再設 assetPrefix。

### 3.3 路徑檢查（四個員工端 app）

- 逐一檢查 `redirect`、`router.push`、`<Link>`、`revalidatePath`、`<form action>`、`fetch('/…')`、原生 `<a href>`、`window.location`、`<img src>`、匯出和下載網址、Route Handler 回傳的網址。
  - `<Link>`、`router.push`、next/navigation 的 `redirect()`：會自動加上 basePath，維持 app 內相對路徑，不要手動加前綴。
  - `revalidatePath`：使用 app 內路徑，不加 basePath。
  - 原生 `<a href>`、`window.location`、`fetch`、Route Handler 產生的網址：要手動加上 `NEXT_PUBLIC_BASE_PATH`。
- 跨 app 連結一律用原生 `<a href>` 加完整路徑（例如 `/rollcall/e/${id}`），不能用 `<Link>`。

### 3.4 跨系統網址

- 新增 `NEXT_PUBLIC_SITE_URL`（統一入口網址）。
- `NEXT_PUBLIC_CHECKIN_URL` 設為 `${SITE_URL}/checkin`，`NEXT_PUBLIC_REGISTRATION_URL` 設為 `${SITE_URL}`。保留讀環境變數的寫法，只要確認組網址時不會出現雙斜線：在各 app 自己的 lib 裡新增 `joinUrl(base, path)`，不要放進共用套件。
- QR 的編碼內容（報名ID 等）不變。已經印出的舊 QR 如果指向舊的 checkin 網址，舊的 Vercel 網址要繼續保留，寫進文件提醒。

## 4. 共用登入（packages/auth）

- cookie 維持 `kids_session`、path '/'、httpOnly、正式環境 secure、sameSite lax，不設定 domain。
- 五個 app 共用同一個 `AUTH_SECRET`，寫進文件。
- `logout()`：用 `cookies().set(COOKIE, '', { path: '/', maxAge: 0 })` 明確以 path '/' 刪除，再 redirect('/login')。
- returnTo：
  - 每個 app 新增 `middleware.ts`，只做一件事：把目前的路徑（含 basePath 和 query）放進 request header `x-pathname`。
  - `requireSession` 未登入時，redirect 到 `/login?next=<x-pathname>`。
  - 新增 `safeNext(next)`：只接受以單一 `/` 開頭的本站路徑；拒絕 `//`、`/\`、含 scheme 的網址，以及含 `\r` `\n` 的值。不合法就回到預設頁。
  - `loginWithForm` 讀取表單的 `next` 欄位，經過 safeNext 後作為 redirectTo。各 app 的登入頁要把 `next` 放進表單的 hidden input。
  - 跨 zone 的 next（例如在 /checkin 登入後要回 /rollcall/...）：登入後用 `redirect()` 導向會被加上 basePath，所以要改回傳 `{ redirect: url }`，讓前端用 `window.location.assign`。也可以用不受 basePath 影響的方式（例如 Response 搭配 Location header）。實作前先確認 Next 14 redirect 處理 basePath 的實際行為，再選擇做法。
- 角色不符：
  - `requireSession` 不再 throw，改成 redirect 到 app 自己的 `/forbidden?reason=role`（只帶原因代碼）。
  - 沒有活動權限時，redirect 到 `/forbidden?reason=event`。
  - Route Handler 和 Server Action 另外提供 `requireSessionOrThrow`，回傳 401 或 403 JSON，或丟出錯誤訊息，不能回傳登入頁的 HTML。
- 新增 `redirectIfLoggedIn(allowedRoles, next)`：在各 app 的登入頁渲染時呼叫；已經有有效的 session 且角色符合時，直接導向，不顯示表單。
- 在文件說明：session 裡的角色、可管理活動、小隊是登入當下的快照。在後台修改帳號權限後，要等對方重新登入（或 session 到期）才會生效。

## 5. 各 app 頁面

- 五個 app 都新增 `/forbidden` 頁：
  - 顯示「目前登入的帳號（名稱、角色）沒有使用本系統的權限」或「沒有此活動的權限」。
  - 按鈕：「回同工入口」（`<a href="/staff">`）、「登出並換帳號」（呼叫 logout 的 Server Action）。
- registration 新增 `/staff`（同工入口）：
  - 未登入：顯示四個系統的卡片，連到各自的登入頁。
  - 已登入：顯示名稱、角色、登出按鈕，並依角色列出可以使用的系統：
    - admin／manager：後台、分組分隊、報到、點名、匯入舊資料
    - staff：報到、點名
  - 全部用原生 `<a href>`。
- registration 首頁底部加一個不顯眼的「同工入口」連結；家長頁面其他部分不變。
- 員工端四個 app 的 header 加上「同工入口」連結（`<a href="/staff">`）。

## 6. 根目錄 `npm run dev`

- 新增 `scripts/dev.mjs`，只用 Node 內建的 `child_process`：
  - 依序啟動五個 app 的 `npm run dev -w @kids/<name>`。
  - 每行輸出加上 `[admin]` 這類前綴。
  - Ctrl+C（SIGINT、SIGTERM）時結束所有子程序。
  - 任一子程序異常結束時，印出是哪個 app、exit code，以及最後 20 行輸出，然後結束其他子程序。
  - 參數 `--only admin,checkin` 只啟動指定的 app。
- 根目錄 package.json 新增 `"dev": "node scripts/dev.mjs"`，保留原本五個 `dev:<app>` 指令。
- dev 啟動流程不能包含搬遷、同步或任何初始化資料的動作。
- 本機用 http://localhost:3001 當統一入口（registration 的 rewrites 指向其他 port）。

## 7. 環境變數與文件

- 更新各 app 的 `.env.example`（沿用 01 任務建立的檔案，補上以下變數）：
  - 所有 app：AUTH_SECRET（五個 app 必須相同）、NEXT_PUBLIC_SITE_URL、SITE_HOST
  - registration：ADMIN_ORIGIN、CHECKIN_ORIGIN、ROLLCALL_ORIGIN、DATA_TOOLS_ORIGIN
  - 各 app：調整 NEXT_PUBLIC_CHECKIN_URL、NEXT_PUBLIC_REGISTRATION_URL 的說明
- 更新 README：
  - 本機開發：`npm run dev`，從 localhost:3001 進入
  - Vercel 部署：五個專案的 Root Directory、只有 registration 綁定自訂網域、各 zone 的 ORIGIN 設定、AUTH_SECRET 必須一致、舊 QR 網址的提醒
- 更新 ARCHITECTURE.md：加入統一入口和路徑分流表、共用登入與權限檢查的說明。

## 8. 實作順序（每個階段結束時依第 0 節做型別檢查）

1. packages/auth（logout、returnTo、safeNext、forbidden、redirectIfLoggedIn）
2. 四個員工端 app 的 next.config.js、middleware、路徑檢查、/forbidden、header 連結
3. registration 的 rewrites、/staff、首頁連結、/forbidden
4. scripts/dev.mjs、package.json、.env.example、文件

## 9. 最終交付（只提供以下內容，保持精簡）

- 已實作功能和主要修改位置
- 有修改的寫死路徑清單（檔案:行號，一行一筆）
- 尚未完成或受環境限制的項目
- 必填的環境變數
- 本機啟動指令
- Vercel 設定步驟
- 型別檢查和邊界檢查的最終結果（只寫通過，或剩餘錯誤數與所在檔案）
- 建議的 git add 指令和一行 commit message

最後要註明：本次未執行測試、build 或部署。
