# 正式切換：Google Sheets → MongoDB

切換會改變 Sheet 的格式（小隊分頁改為分組、分組成員；報到／點名／時間表改用分組ID），請在**活動開始前**完成，不要在活動進行中切換。

## 事前準備

1. 建立 MongoDB（例如 Atlas），取得 `MONGODB_URI`；建立 database 使用者（只給這個 database 的讀寫權限）
2. admin 設定 `SYNC_TOKEN`、`MIGRATE_TOKEN`（各自亂數，至少 32 字元）
3. 五個 app 都設定 `MONGODB_URI`、`MONGODB_DB`，但先維持 `DATA_BACKEND=sheets`，部署
4. 預覽搬遷並處理異常（課程名稱對不到、成員ID 不存在、重複 ID）：

   ```bash
   ADMIN_BASE_URL=https://<admin 網址> MIGRATE_TOKEN=... node scripts/migrate.mjs --source sheets
   ```

## 切換當天

1. **備份**：在 Google Drive 把主資料試算表與所有活動試算表各「建立副本」
2. **暫停寫入**：五個 app 設定 `READ_ONLY=1` 並重新部署（畫面可看，寫入會顯示「系統維護中」）。請同工暫停在 Sheet 上修改資料
3. **正式搬遷**：

   ```bash
   ADMIN_BASE_URL=... MIGRATE_TOKEN=... node scripts/migrate.mjs --source sheets --apply
   ```

   報告中「系統中已有修改過的資料，未覆寫」表示該筆在 MongoDB 已被系統修改，搬遷不會蓋掉它
4. **切換**：五個 app **同時**改為 `DATA_BACKEND=mongo`、移除 `READ_ONLY`，重新部署。不可讓舊的 sheets 版本與 mongo 版本同時接受寫入
5. **第一次同步**：登入 admin →「初始化」→「立即同步」，確認活動試算表出現「分組」、「分組成員」分頁，報到／點名／時間表有「分組ID」、「分組名稱」欄
6. **Apps Script**：依 README 建立專案、設定 Script Properties，執行 `setup()`
7. 抽查：報名一筆（含選課）、報到一筆、點名一筆，確認 5 分鐘內出現在 Sheet；在 Sheet 修改一位成員的特殊需求，確認系統有更新
8. 移除 admin 的 `MIGRATE_TOKEN`

## 回退

- **切換後還沒有任何新資料**：五個 app 改回 `DATA_BACKEND=sheets` 並部署舊版本，把備份的試算表副本換回（或把「活動試算表」連結指回副本）
- **切換後已有新資料**：不可直接回退，否則會遺失切換後的報名、報到、點名。請往前修正；若一定要回退，先在 admin 匯出報表（報名名單、分組成員明細、報到、點名），回退後再人工補回

## 切換後

- 舊的「小隊」分頁不會被刪除，確認無誤後可手動刪除
- 帳號的「小隊」欄仍可用（以名稱比對分組），建議逐步改到活動的「分組」頁指派負責人
