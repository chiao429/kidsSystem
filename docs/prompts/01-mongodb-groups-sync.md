# 任務：kidsSystem 改用 MongoDB、統一分組模型（小隊／課程）、Google Sheet 鏡像同步

請實際修改程式並依階段完成，不要只提供建議或範例。

## 0. 工作限制

- 先閱讀 README.md、ARCHITECTURE.md，只檢查和任務直接相關的檔案。
- 工作樹裡已有未提交的修改：要保留，不能覆蓋或回退。
- 沿用 Next.js 14 App Router、Server Actions、@kids/ui、現有角色與業務規則；不升級套件，也不重構無關程式。
- 五個 app 都保留，不另外建後端，不新增 app 之間的 import 或 API 呼叫。
- 可以新增官方 `mongodb` driver。其他依賴要先說明為什麼需要，取得同意後才能加。
- 保留所有既有 ID（活動、家庭、成員、報名、報到、點名、帳號）和 QR 內容。
- 不實際連線正式 MongoDB 或 Google Sheets 寫入資料，也不執行正式搬遷。
- 不寫測試，不跑 build，不部署，不 commit，不 push。

### 型別檢查（允許，但要節省輸出）

- 只在每個階段結束時執行一次，不要每改一個檔案就跑。
- 只檢查受影響的 workspace，並截斷輸出：
  `npm run typecheck -w @kids/<name> 2>&1 | grep -E "error TS" | head -30`
- 修正後只重跑還有錯誤的 workspace。全部完成後，整體只跑一次：
  `npm run typecheck 2>&1 | grep -E "error TS" | head -30`
- 另外跑一次 `npm run check:boundaries`。
- 不要把完整的 typecheck 輸出貼進回覆。

## 1. 背景（現況）

- npm workspaces monorepo：apps/{registration,checkin,rollcall,admin,data-tools}，packages/{schema,sheets-core,auth,ui}。
- 所有 app 只透過 `packages/sheets-core` 的 `SheetTable` 讀寫：all / findById / append / updateByIds / deleteByIds / replaceAll / ensure。底層有 googleBackend 和 localBackend（`SHEETS_LOCAL_DIR`）。
- 表定義在 `packages/schema/src/tables.ts`（tab、idColumn、headers、owner、updatableBy）。主資料表用 `GOOGLE_MASTER_SHEET_ID`；活動表用「活動」分頁的「活動試算表」ID。各 app 在 `lib/tables.ts` 用 `registrations(event.sheetId)` 這類工廠函式取得表。
- 小隊和課程目前是兩套互斥的做法：
  - 課程定義存在「活動．報名規則」JSON 的 `courses: [{ name, capacity }]`；`grouping: 'team' | 'course'` 只能二選一。
  - 選課存在「報名．課程」的逗號字串（registration/lib/actions.ts），各處再用 `splitList` 拆開。
  - 小隊放在「小隊」表（小隊成員ID、小隊名稱、成員ID、姓名、角色、區域）。區域是年級組別；小隊長和老師也是這張表的列（成員ID = 帳號）。
  - 報到：同一筆報名有一列「一般報到」（課程 = ''），每門課程再各一列；鍵為 `報名ID|課程`（checkin/lib/board.ts 的 checkInKey）。
  - 點名的「小隊」欄，在課程模式下放的是課程名稱；時間表的「小隊」欄可以是小隊名稱、課程名稱或「全部」。
  - staff 的點名權限來自「帳號．小隊」（session.team，存名稱），或小隊表中角色不是隊員、且成員ID = 帳號的列（rollcall/lib/data.ts loadTeams）。
  - data-tools 重新分隊時用 `replaceAll`（lib/team-actions.ts autoDivide）。

## 2. 目標

1. MongoDB 成為唯一正式資料來源，所有 app 都改讀寫 MongoDB。
2. 小隊和課程統一成「分組」：同一場活動可以同時有小隊和課程，全部用 ID 關聯。
3. 資料用活動ID 劃分範圍；Google Sheet ID 只用來指定同步目的地。
4. Google Sheet 改為鏡像：MongoDB 可靠地推送到 Sheet；少數欄位可以從 Sheet 寫回，後台也提供同樣的編輯畫面。
5. 報到和點名用唯一索引防止重複紀錄。
6. 擁有權規則由資料層強制檢查，並支援依類型決定擁有者。
7. 提供搬遷工具（預設只預覽）和正式切換文件。

## 3. schema（packages/schema）

### 3.1 TableDef 擴充（tables.ts）

- `key`：英文 collection 名稱。
- `scope`：'master' | 'event'。
- `uniqueKeys?`：其他唯一鍵（欄位陣列的陣列）。
- `owner`：可以是 `SystemName`，或依某欄位的值決定：
  `{ byColumn: '類型', owners: Record<string, SystemName[]> }`。
- `updatableBy`：不變。
- `sheetEditable?`：允許從 Sheet 寫回的欄位。
- `displayColumns?`：只出現在 Sheet 鏡像、不存進 MongoDB 的計算欄位。
- `mirrorExclude?`：不可推送到 Sheet 的欄位。

### 3.2 新表與變更

- 新增「分組」（event）：
  - headers：分組ID、類型（小隊｜課程）、名稱、代碼、名額、區域、說明、排序、狀態（啟用｜停用）
  - owner：byColumn 類型 → 課程：['admin']；小隊：['data-tools','admin']
  - uniqueKeys：[['類型','名稱']]
- 新增「分組成員」（event）：
  - headers：分組成員ID、分組ID、類型、成員ID、報名ID、角色（隊員｜學員｜小隊長｜老師｜助理…）、來源（報名｜分隊｜後台｜搬遷）、建立時間
  - owner：byColumn 類型 → 課程：['registration','admin']；小隊：['data-tools','admin']
  - uniqueKeys：[['分組ID','成員ID']]
  - 工作人員的成員ID 填帳號。小隊類型中，每個成員最多一列「隊員」，由 data-tools 的寫入邏輯保證。
  - displayColumns：分組名稱、姓名（從成員表查，查不到再查帳號表）。
  - sheetEditable：分組名稱、角色。
- 刪除「小隊」表（TeamTable）。
- 「報名」：移除「課程」欄，改成 displayColumns 的「課程」（由分組成員組成「美勞課、音樂課」）。sheetEditable：狀態、備註。
- 「報到」：「課程」欄改為「分組ID」（空字串代表一般報到）。uniqueKeys：[['報名ID','分組ID']]。displayColumns：分組名稱。
- 「點名」：「小隊」欄改為「分組ID」。uniqueKeys：[['時段ID','分組ID','成員ID']]。displayColumns：分組名稱。
- 「時間表」：「小隊」欄改為「分組ID」（空字串代表全部），新增「分組類型」欄（小隊｜課程｜空白）。displayColumns：分組名稱。
- 「家庭」sheetEditable：主要聯絡人、電話、Email、地址。
- 「成員」sheetEditable：姓名、性別、生日、年級、學校、類型、特殊需求。
- 「帳號」mirrorExclude：密碼雜湊。「帳號．小隊」保留作為舊資料相容（用名稱比對分組），標註 @deprecated。
- 更新 `ALL_TABLES`、`MASTER_TABLES`、`EVENT_TABLES`。

### 3.3 rules.ts

- `EventRules` 移除 `courses`、`grouping`，新增 `groupTypes: ('小隊'|'課程')[]`（預設 ['小隊']）。
- `parseRules` 要能讀舊格式：`grouping:'course'` 轉成 ['課程']。courses 由搬遷流程處理，這裡不轉換。

### 3.4 新增 groups.ts（純函式）

- 型別：`Group`、`GroupMember`、`GroupType`。
- 函式：
  - `groupsOfType(groups, type)`
  - `membersOfGroup(members, 分組ID, roles?)`
  - `groupCounts(members, type)`：計算各分組人數，供名額檢查和報表使用。
  - `leaderGroupIds(members, account)`：回傳該帳號擔任非隊員、非學員角色的分組ID。

## 4. 資料層（packages/sheets-core）

### 4.1 store 介面與 MongoDB 實作

- `src/store.ts`：定義 `TableStore<T>`，方法和 SheetTable 相同，另外新增：
  - `upsertByKey(keyColumns, row)` → `{ created, before, row }`
  - `upsertManyByKey(keyColumns, rows)`
  - `replaceWhere(filter, rows)`：filter 支援等於和 `{ $in: [...] }`，只取代符合條件的列。
- `src/mongo.ts`：
  - 使用官方 `mongodb` driver，client 快取在 globalThis，不能每個請求都建立新連線。
  - 一個 database（`MONGODB_DB`），每張表一個 collection（`def.key`）。
  - 文件欄位直接用中文標題，另加系統欄位：
    - `_scope`：master 表固定為 'master'；event 表為活動ID
    - `_id`：`${_scope}:${id}`
    - `_ver`：每次寫入都用 `$inc` 加 1
    - `_dirty`：每次寫入都設為 true
    - `_updatedAt`、`_deleted`
  - `_ver` 和 `_dirty` 必須和業務欄位在**同一次寫入**中更新，確保原子性。
  - 索引：
    - `{_scope, <idColumn>}` unique
    - 每組 uniqueKeys：`{_scope, ...keys}` partial unique（條件 `_deleted:false`）
    - `{_scope, _dirty}`
  - 刪除一律軟刪除。replaceAll 和 replaceWhere 用 transaction。
  - 撞到唯一鍵時，丟出包含表名和鍵值的錯誤。
- sheets 和 local 實作也要支援新方法（讀出全部再寫回即可），讓本機不用 MongoDB 也能開發。

### 4.2 table.ts（SheetTable 對外 API 維持相容）

- constructor 改成 `(scope: string, def, actor: SystemName, opts?: { ttlMs })`。scope 是 'master' 或活動ID。
- 依 `DATA_BACKEND`（'mongo' | 'sheets' | 'local'）選擇實作。sheets 和 local 模式仍需要試算表 ID，用 `resolveSheetId(scope)` 查「活動」表取得。
- 強制權限檢查：
  - 新增、刪除、取代、upsert 新建列：actor 必須是 owner；byColumn 時依每列的類型值判斷。
  - 更新既有列：owner 不限欄位；其他系統只能改 `updatableBy[actor]` 裡的欄位。
  - LogTable 所有系統都可以 append。
  - 違反時 throw `權限錯誤：<actor> 不可修改「<tab>.<欄位或類型>」`。
- `READ_ONLY=1` 時，所有寫入都 throw `系統維護中，暫停寫入`（切換期間使用）。
- mongo 模式的快取 TTL 預設 2 秒；`fresh: true` 直接查資料庫。
- `readRawTab` 固定走 Google Sheets，用於匯入舊資料和搬遷。

### 4.3 mirror.ts（Sheet 同步，只給 admin 使用）

- `pushDirty({ maxTables, timeBudgetMs })`：
  1. 取得鎖：在 `_sync_locks` 用 findOneAndUpdate 搶鎖（條件 `lockedUntil < now`，鎖 2 分鐘）。搶不到就直接回傳 `{ skipped: 'locked' }`。
  2. 找出有 `_dirty:true` 的（表, scope）組合，最多處理 maxTables 組，並受時間預算限制。
  3. 每一組：讀出整張表（含軟刪除的列，用來移除 Sheet 上的對應列）並記下每筆的 `_ver` → 依 ID 寫到 Sheet → 寫入成功後，用 bulkWrite 對每筆執行 `{ _id, _ver: 讀到的版本 }` → `_dirty:false`。推送期間被修改過的資料版本號不同，會保持 dirty，下次再推送。
  4. 遇到 Google API 的 429 或 5xx：退避重試最多 3 次（1s、2s、4s）。仍失敗時，把錯誤和失敗次數記在 `_sync_state`，繼續處理下一組。
  5. `_sync_state` 記錄每個（表, scope）的 lastSuccessAt、lastError、failures。
  6. 結束時釋放鎖。
- Sheet 寫入規則：
  - 用 ID 對應列，不把列號當永久識別。
  - 依 Sheet 現有的標題順序寫入 headers ＋ displayColumns。
  - 不在 schema 裡的手動欄位，依 ID 保留原本的值。
  - 軟刪除的列從 Sheet 移除。
  - mirrorExclude 的欄位不寫入；如果 Sheet 上已經有這欄，要清空它的值（例如帳號的密碼雜湊）。
  - displayColumns 在推送時計算。分組有變動時，把依賴它的表（分組成員、報到、點名、時間表、報名）同一 scope 的資料也標成 dirty，名稱才會更新。
- `applySheetEdit({ spreadsheetId, tab, id, header, oldValue, newValue, editor })`：
  - 用 spreadsheetId 反查 scope。header 必須在 sheetEditable 裡。
  - 資料庫目前的值（displayColumn 用計算出的值）不等於 oldValue：寫入 `_sync_conflicts`，這次不寫入。
  - 「分組成員．分組名稱」：在同一 scope、同一類型中依名稱找出分組ID 後更新；找不到就 rejected。
  - 通過時以 actor 'admin' 寫入，並記一筆日誌（系統 = 'sheet'，操作者 = editor）。
- `resetSync(table?, scope?)`：把指定範圍全部標成 dirty，用來重新產生 Sheet。

### 4.4 migrate.ts（搬遷，只給 admin 使用）

`migrate({ source: 'sheets' | 'local', eventIds?, apply })`

- source 'local' 讀 `SHEETS_LOCAL_DIR`；'sheets' 讀 Google Sheets。
- 一律用 upsert（以 `_id` 為鍵），重跑不會產生重複資料，也不刪除來源資料。
- 主資料：家庭、成員、帳號（含密碼雜湊）、活動直接匯入，保留所有 ID。
- 每場活動（可以用 eventIds 限定範圍）建立「名稱 → 分組ID」對照表，再依序處理：
  1. 報名規則的 courses → 分組（類型 課程、名稱、名額，依原本順序排序）
  2. 舊小隊表中不重複的小隊名稱 → 分組（類型 小隊，區域取第一筆）；每一列 → 分組成員（角色照舊，來源 搬遷）
  3. 報名．課程用 splitList 拆開 → 分組成員（類型 課程、角色 學員，含報名ID 和成員ID）
  4. 報到．課程：空字串維持空字串；有名稱的轉成分組ID
  5. 點名．小隊：舊 grouping 是 course 的活動對課程分組，否則對小隊分組
  6. 時間表．小隊：「全部」轉成分組ID 空字串，分組類型依舊 grouping；其他名稱轉成分組ID
  7. 報名規則改寫成 groupTypes 格式
  8. 其餘表直接匯入
- 分組ID 要穩定：用 `活動ID + 類型 + 名稱` 雜湊產生，重跑時不會變。
- 報告內容：每張表的筆數、名稱對不到（表、ID、原值）、重複 ID、關聯缺漏（例如報名的成員ID 不存在、報到的報名ID 不存在）。
- `apply:false` 時只產生報告，不寫入任何資料。
- 搬遷寫入的資料全部標成 dirty，切換後第一次同步會把 Sheet 改成新格式。

## 5. 各 app 的 lib/tables.ts 與呼叫端

- 工廠函式改為傳入活動ID：`registrations(eventId)`，並帶入自己的 actor。
- 所有呼叫端從 `xxx(event.sheetId)` 改成 `xxx(event.活動ID)`。
- 拿掉 `teams()`，依需要新增 `groups()`、`groupMembers()`。
- `ensureEventTables`、`ensureMasterTables`：mongo 模式下建立索引；sheets 模式維持建立分頁。

## 6. registration

- 報名頁的課程選項改從分組表讀取（類型 課程、狀態 啟用）。表單值送分組ID，畫面顯示名稱和剩餘名額。
- `lib/eligibility.ts`：
  - 名額改用 `groupCounts`，扣掉已取消的報名。
  - 「至少選一門課」的檢查：此活動的 groupTypes 包含課程，而且有啟用的課程分組時才檢查。
- `lib/actions.ts`：報名列不再寫課程。報名列寫入後，為每門選課寫一列分組成員（類型 課程、角色 學員、來源 報名）。
- 完成頁：課程名稱改由分組成員和分組查出。
- `lib/import.ts`：匯入舊報名時不寫課程。

## 7. checkin

- `lib/board.ts`：
  - `loadBoard(eventId, 分組ID = '')`：課程看板依分組成員篩選。
  - 小隊和區域由分組成員（類型 小隊、角色 隊員）查出。
  - 列上的課程改成 `{ 分組ID, 名稱 }[]`。
  - checkInKey 改用 `報名ID|分組ID`。
- `lib/actions.ts`：報到改用 `upsertByKey(['報名ID','分組ID'], row)`，用回傳的 before 判斷「已報到過」。
- `lib/types.ts`、Dashboard、CheckInBoard：
  - `grouping`、`courses` 改成 `groupTypes` 和 `groups: { 分組ID, 類型, 名稱, 區域, 說明 }[]`。
  - 小隊區和課程區可以同時顯示。
  - 所有用名稱比對課程的地方改用分組ID。

## 8. rollcall

- `lib/data.ts`：
  - `loadTeams` 改成 `loadGroups(eventId, session, groupTypes)`：
    - all：啟用的分組
    - mine：`leaderGroupIds`，加上「帳號．小隊」用名稱比對到的分組（舊資料相容）
    - allowed：staff 只能看 mine，admin 和 manager 可以看全部
  - `assertGroup(allowed, 分組ID)`
  - `loadSlots`：時段符合條件 = 分組ID 等於這組，或「分組ID 為空，而且分組類型為空或等於這組的類型」。
  - `loadRoll(eventId, 分組ID, slotId)`：
    - 人員 = 分組成員中角色為隊員或學員的人
    - 報到狀態：小隊看一般報到（分組ID 空），課程看該課程的報到
    - 不再用 grouping 分支
- 路由 `/e/[eventId]/t/[team]`：參數內容改成分組ID，頁面顯示分組名稱和類型。
- `lib/actions.ts`：點名改用 `upsertManyByKey(['時段ID','分組ID','成員ID'], rows)`。
- `lib/stats.ts`、`export/route.ts`：改用分組成員和分組ID 計算，輸出顯示分組名稱和類型。
- 首頁依類型分區顯示「我的小隊／我的課程」和「其他小隊／其他課程」。

## 9. data-tools

- `lib/roster.ts`：小隊和課程改由分組成員和分組查出。
- `lib/team-actions.ts`：
  - autoDivide：先 upsert 小隊分組（名稱、區域 = group）取得分組ID，再用 `replaceWhere({ 類型:'小隊', 角色:'隊員', 分組ID:{ $in: 該區域的小隊分組ID } }, …)` 取代隊員。小隊長和課程成員不能受影響。
  - moveMember：更新隊員列的分組ID；沒有就新增；選擇空白時刪除。
  - addLeader：新增分組成員（類型 小隊、角色依表單、成員ID = 帳號）。
  - removeTeamRow：刪除分組成員。
  - 新增：新增小隊、改名、調整區域／說明／排序、停用。
- 頁面上「課程模式不需分隊」改成依 groupTypes 判斷，顯示「此活動未啟用小隊」。
- export 欄位不變，資料改從新結構組出。

## 10. admin

1. 活動設定（EventForm、event-actions）：
   - 移除課程 textarea 和「分組方式」下拉選單，改成「啟用的分組類型」勾選框。
   - 新增活動時建立索引；sheets 模式下建立分頁。
2. `/events/[eventId]/groups`（新頁面）：
   - 課程和小隊分成兩個頁籤。
   - 課程：新增、編輯（名稱、代碼、名額、說明、排序）、停用；顯示報名數和剩餘名額；指派老師（選帳號，寫入分組成員，角色 老師）。
   - 小隊：總覽，可編輯名稱、區域、說明；分隊仍在 data-tools 操作，這裡放一個連過去的連結。
3. `/events/[eventId]/teams`（新頁面）：依小隊顯示隊員，可以調整所屬小隊和角色。
4. `/events/[eventId]/registrations`：
   - 課程欄改成顯示分組名稱。
   - 備註可以行內編輯。
   - 新增「調整選課」功能，增加或刪除課程分組成員。
5. `/families`、`/families/[householdId]`（新頁面）：家庭和成員的編輯頁，欄位 = updatableBy.admin；只送出有變動的欄位，同時寫入更新時間和日誌。
6. `/events/[eventId]/schedule`：
   - 對象改成「全部／全部小隊／全部課程／某個分組」，寫入分組ID 和分組類型。
   - 匯入 groupSchedule.json 時用名稱對應分組ID。
7. `lib/reports.ts` 和 `/events/[eventId]/reports`：
   - 報名明細：小隊和課程欄由分組成員組出，多門課用「、」連接。
   - 新增「分組成員明細」（長格式）：活動、分組類型、分組名稱、代碼、姓名、性別、年級、學校、角色、報名狀態、一般報到狀態、該組報到狀態、出席次數、應出席時段數、出席率。
   - 新增「分組統計」：名額、報名數、報到數、平均出席率，可以依類型篩選。
   - 沿用現有 CSV 可選欄位機制。
8. `/accounts`：「小隊」欄標示「舊欄位，建議改到分組指派負責人」。
9. `/setup` 的「資料同步」區塊（admin 角色限定）：
   - 每個（表, scope）顯示待同步筆數、lastSuccessAt、lastError、failures。
   - 按鈕：「立即同步」（pushDirty）、「重新產生 Sheet」（resetSync，要再次確認）。
   - 最近 50 筆 Sheet 寫回衝突，可以標記為已處理。
10. API（Route Handlers）：
    - `app/api/sync/*`：用 `Authorization: Bearer ${SYNC_TOKEN}` 驗證。
      - `GET  /api/sync/targets`：主資料試算表 ID，和狀態不是「已結束」的活動試算表 ID
      - `POST /api/sync/push`：pushDirty，回傳處理結果
      - `POST /api/sync/edits`：applySheetEdit（可以是陣列），回傳每筆的 applied / conflict / rejected 和原因
    - `app/api/migrate`：用 `Authorization: Bearer ${MIGRATE_TOKEN}` 驗證。
      - `POST`：body 為 `{ source, eventIds?, apply }`，回傳搬遷報告
      - 沒設定 MIGRATE_TOKEN 時一律回 404
    - 驗證失敗回 401 JSON，不能回傳登入頁的 HTML。

## 11. 外部觸發與指令

- `scripts/apps-script/Sync.gs`（獨立的 Apps Script 專案）：
  - Script Properties：ADMIN_BASE_URL、SYNC_TOKEN。
  - `setup()`：
    - 建立每 5 分鐘一次的 `tick()`（頻率寫成常數，方便調整）
    - 對每份目標試算表安裝 `onSheetEdit` 觸發（`ScriptApp.newTrigger(...).forSpreadsheet(id).onEdit()`）
    - 不在 sheetEditable 的欄位設為 `protect().setWarningOnly(true)`
  - `tick()`：POST /api/sync/push，並為新出現的活動試算表補裝觸發。
  - `onSheetEdit(e)`：
    - 從第 1 列標題找出欄位，從 idColumn 找出 ID
    - 送出 `{ spreadsheetId, tab, id, header, oldValue, newValue, editor }`；一次貼上多格時組成陣列一起送
    - 回傳 conflict 或 rejected 時，在該格加註解說明原因
- `scripts/migrate.mjs`（只用 Node 內建功能，不新增依賴）：
  - `node scripts/migrate.mjs --source sheets|local [--event <活動ID>]... [--apply]`
  - 呼叫 `${ADMIN_BASE_URL}/api/migrate`，以表格印出報告。
  - 沒加 `--apply` 時只預覽。
- `scripts/sync.mjs`：`node scripts/sync.mjs` 呼叫一次 /api/sync/push，供本機或其他排程器使用。
- 不在 Next.js server 裡用 setInterval 當排程。

## 12. 環境變數與文件

- 各 app 新增 `.env.example`，內容包括：
  - DATA_BACKEND、MONGODB_URI、MONGODB_DB、READ_ONLY
  - Google service account 相關變數（同步和搬遷用）
  - admin 專用：SYNC_TOKEN、MIGRATE_TOKEN
  - 不要寫入任何真實憑證
- 更新 README（環境變數、分組流程、同步與搬遷指令）。
- 更新 ARCHITECTURE.md：
  - 移除「系統之間只透過 Google Sheet 溝通」，改成「透過同一個 MongoDB，依 owner／updatableBy 讀寫，由資料層強制檢查」。
  - 資料表清單和讀寫權責表加入分組、分組成員。
  - 說明 Sheet 是鏡像，以及哪些欄位可以寫回。
- 新增 `docs/cutover.md`（正式切換步驟）：
  1. 切換前：複製所有試算表作為備份；在活動前完成，不要在活動進行中切換。
  2. 五個 app 設定 `READ_ONLY=1` 並重新部署，暫停寫入。
  3. 執行搬遷預覽 → 處理報告中的異常 → 加 `--apply` 正式搬遷。
  4. 五個 app 同時改成 `DATA_BACKEND=mongo`、移除 READ_ONLY，重新部署。不能同時讓舊的 Sheets 版本和 MongoDB 版本接受寫入。
  5. 執行一次同步，確認 Sheet 已變成新格式；在 Apps Script 執行 setup()。
  6. 回退：切換後還沒有新資料時，可以還原備份的試算表並部署舊版本。已有新資料時不能直接回退，否則會遺失資料，只能往前修正；如果一定要回退，先匯出新資料再人工補回。
  7. 舊的「小隊」分頁不會被刪除，確認沒問題後可以手動刪除。

## 13. 實作順序（每個階段結束時依第 0 節做型別檢查）

1. schema（tables、rules、groups）
2. sheets-core（store、mongo、table 權限、mirror、migrate）
3. 各 app 的 tables.ts 和呼叫端改用活動ID
4. registration → checkin → rollcall → data-tools
5. admin（頁面、報表、API）
6. scripts（Apps Script、migrate.mjs、sync.mjs）、.env.example、文件

## 14. 最終交付（只提供以下內容，保持精簡）

- 已實作功能和主要修改位置（依 package／app 條列）
- 尚未完成或受環境限制的項目
- 新增的依賴
- 必填的環境變數
- 搬遷預覽和正式執行的指令
- 同步的觸發方式（Apps Script 設定步驟、sync.mjs）
- 型別檢查和邊界檢查的最終結果（只寫通過，或剩餘錯誤數與所在檔案）
- 建議的 git add 指令和一行 commit message

最後要註明：本次未執行測試、build、正式資料搬遷或部署。
