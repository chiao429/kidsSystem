# kidsSystem 兒童活動管理平台

由多個**獨立**系統組成，資料存放於 Google Sheets。

```
kidsSystem/
├── apps/                    每個系統一個資料夾，可獨立開發、部署
│   ├── registration/  :3001 報名系統：第一次報名、一般報名、同戶報名、資格判斷
│   ├── checkin/       :3002 報到系統：報到驗證、課程報到、現場報到（承接 EasyCheckIn）
│   ├── rollcall/      :3003 點名系統：小隊/時段點名、即時統計、報表
│   ├── admin/         :3004 系統管理後台：活動與規則、帳號、時間表、問卷、報表
│   └── data-tools/    :3005 資料整理：分組、家庭/手足、分隊、名單匯出（承接 eventDataClean）
└── packages/
    ├── schema/              資料契約：分頁名稱、欄位、狀態值、ID 產生
    ├── sheets-core/         Google Sheets 存取：依標題讀寫、依 ID 更新、快取、批次寫入
    ├── auth/                登入（帳號分頁）、session cookie、角色檢查
    └── ui/                  共用外觀元件
```

## 開發

```bash
npm install
cp .env.example apps/checkin/.env.local   # 每個 app 各自一份 .env.local
npm run dev:checkin
```

## 部署

每個 app 在 Vercel 建立獨立專案，Root Directory 設為 `apps/<name>`。

詳見 [ARCHITECTURE.md](ARCHITECTURE.md) 與 [ROADMAP.md](ROADMAP.md)。
