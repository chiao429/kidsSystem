# 部署到 GCP（Cloud Run ＋ GitHub Actions）

push 到 `main` 自動部署 **staging**；推送 `v*` tag（例如 `v1.0.0`）部署 **production**。流程定義在 `.github/workflows/deploy.yml`：

1. `check`：`npm run check:boundaries`、`npm run typecheck`，失敗就不部署
2. `plan`：判斷要部署哪些 app（只改 `apps/checkin/` 就只部署 checkin；改到 `packages/`、`Dockerfile`、lock 檔則全部部署；tag 一律全部）
3. `deploy`：每個 app 用根目錄的 `Dockerfile` 打包 → 推到 Artifact Registry → 部署成 Cloud Run 服務 `kids-<stg|prod>-<app>`

沒有自訂網域時，入口就是 registration 的 Cloud Run 網址：

```
https://kids-stg-registration-<專案編號>.asia-east1.run.app          ← 家長報名、/staff 同工入口
https://kids-stg-registration-<專案編號>.asia-east1.run.app/admin    ← 轉送到 kids-stg-admin
...
```

各服務網址固定為 `https://<服務名稱>-<專案編號>.<區域>.run.app`，workflow 會自動算出來，並在 build 時寫入轉送設定，不需要手動填。

## 最快的方式：一鍵設定腳本

第二到第六步、第八步可以用腳本一次完成（可重複執行，已建立的會略過）：

```bash
gcloud auth login
bash scripts/gcp-setup.sh
```

腳本會詢問 GCP 專案 ID、Sheets 金鑰檔路徑、MongoDB 網址與主資料試算表 ID。若有安裝並登入 GitHub CLI（`gh`），GitHub Environments 的變數也會自動寫入；否則最後會印出要貼上的值。下面是腳本做的每一步，供需要手動設定或排查時參考。

## 一、事前準備

- GCP 專案（以下用 `$PROJECT_ID`），並已啟用帳單
- 本機安裝 `gcloud`，以有專案擁有者權限的帳號登入
- GitHub repo（以下用 `$REPO`，格式 `owner/name`）
- MongoDB Atlas：staging、production 各建一個 database 使用者（或各一個 cluster），區域選 GCP `asia-east1`；Network Access 先允許 `0.0.0.0/0`（Cloud Run 沒有固定 IP），用強密碼保護
- Google Sheets 用的 service account 金鑰（JSON 裡的 `client_email`、`private_key`），試算表已共用給它

```bash
PROJECT_ID=<你的專案ID>
REGION=asia-east1
REPO=chiao429/kidsSystem
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
gcloud config set project $PROJECT_ID
```

## 二、啟用服務、建立 Artifact Registry

```bash
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com cloudscheduler.googleapis.com sts.googleapis.com
gcloud artifacts repositories create kids --repository-format=docker --location=$REGION
```

## 三、兩個 service account

- `kids-deployer`：GitHub Actions 用來推 image、部署
- `kids-runtime`：Cloud Run 執行時的身分（只能讀 Secret）

```bash
gcloud iam service-accounts create kids-deployer
gcloud iam service-accounts create kids-runtime
DEPLOY_SA=kids-deployer@$PROJECT_ID.iam.gserviceaccount.com
RUNTIME_SA=kids-runtime@$PROJECT_ID.iam.gserviceaccount.com

for role in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$DEPLOY_SA --role=$role
done
gcloud iam service-accounts add-iam-policy-binding $RUNTIME_SA --member=serviceAccount:$DEPLOY_SA --role=roles/iam.serviceAccountUser
gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$RUNTIME_SA --role=roles/secretmanager.secretAccessor
```

## 四、Workload Identity Federation（GitHub 不需存 GCP 金鑰）

```bash
gcloud iam workload-identity-pools create github --location=global
gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
  --attribute-condition="assertion.repository=='$REPO'"
gcloud iam service-accounts add-iam-policy-binding $DEPLOY_SA \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO"
echo "WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
```

## 五、Secret Manager（每個環境一組，`<env>` 為 `stg` 或 `prod`）

| Secret 名稱 | 內容 |
|---|---|
| `kids-<env>-auth-secret` | 至少 32 字元亂數（五個 app 共用） |
| `kids-<env>-mongodb-uri` | MongoDB 連線字串 |
| `kids-<env>-google-private-key` | service account 金鑰的 `private_key`（含換行原樣貼上） |
| `kids-<env>-sync-token` | 至少 32 字元亂數（admin 同步 API、Apps Script、Cloud Scheduler 共用） |

```bash
for ENV in stg prod; do
  openssl rand -base64 36 | tr -d '\n' | gcloud secrets create kids-$ENV-auth-secret --data-file=-
  openssl rand -base64 36 | tr -d '\n' | gcloud secrets create kids-$ENV-sync-token --data-file=-
  printf '%s' '<MongoDB URI>' | gcloud secrets create kids-$ENV-mongodb-uri --data-file=-
  jq -j .private_key <金鑰.json> | gcloud secrets create kids-$ENV-google-private-key --data-file=-
done
```

## 六、GitHub 設定

Settings → Environments 建立 `staging`、`production`（production 建議勾「Required reviewers」，tag 部署前需要人工核准），兩個環境各設定 **Variables**：

| 變數 | 範例 |
|---|---|
| `GCP_PROJECT_ID` | 你的專案 ID |
| `GCP_PROJECT_NUMBER` | `$PROJECT_NUMBER` |
| `GCP_REGION` | `asia-east1` |
| `WIF_PROVIDER` | 第四步印出的值 |
| `DEPLOY_SA` | `kids-deployer@<專案>.iam.gserviceaccount.com` |
| `RUNTIME_SA` | `kids-runtime@<專案>.iam.gserviceaccount.com` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Sheets service account 的 email |
| `GOOGLE_MASTER_SHEET_ID` | 該環境的主資料試算表 ID（staging 建議用另一份試算表） |
| `MONGODB_DB` | `kids_stg` / `kids` |
| `DATA_BACKEND` | `mongo`（未設定預設 mongo） |

這些都不是機密，機密只放在 Secret Manager。

## 七、第一次部署

1. push 到 `main`（或在 Actions 頁手動執行 `deploy`，選 staging）
2. 第一次登入需要初始管理員密碼，部署完成後設定一次：

   ```bash
   gcloud run services update kids-stg-admin --region=$REGION --update-env-vars=ADMIN_BOOTSTRAP_PASSWORD=<臨時密碼>
   ```

   打開 `https://kids-stg-registration-$PROJECT_NUMBER.$REGION.run.app/admin` 以 `admin` 登入 →「初始化」→ 建立正式 admin 帳號，然後移除這個變數（`--remove-env-vars=ADMIN_BOOTSTRAP_PASSWORD`）
3. 若要從現有 Google Sheets 搬遷，依 [cutover.md](cutover.md) 操作（`MIGRATE_TOKEN` 用 `--update-env-vars` 暫時加到 admin，完成後移除）

## 八、定時同步到 Sheet（Cloud Scheduler）

```bash
for ENV in stg prod; do
  gcloud scheduler jobs create http kids-$ENV-sync \
    --location=$REGION --schedule="*/5 * * * *" --time-zone=Asia/Taipei \
    --uri="https://kids-$ENV-registration-$PROJECT_NUMBER.$REGION.run.app/admin/api/sync/push" \
    --http-method=POST \
    --headers="Authorization=Bearer $(gcloud secrets versions access latest --secret=kids-$ENV-sync-token)"
done
```

Sheet 上的修改寫回仍使用 Apps Script（`scripts/apps-script/Sync.gs`）：Script Properties 的 `ADMIN_BASE_URL` 填 `https://kids-<env>-registration-<專案編號>.asia-east1.run.app/admin`。有了 Cloud Scheduler 後，可把 `Sync.gs` 的 `TICK_MINUTES` 改大（例如 30），只用來補裝新活動的編輯觸發。

## 九、日常操作

| 要做的事 | 怎麼做 |
|---|---|
| 部署 staging | push 到 `main` |
| 發布 production | `git tag v1.2.0 && git push origin v1.2.0`，在 GitHub 核准 |
| 回退 | Cloud Run → 服務 → 修訂版本，把流量切回上一版（或 `gcloud run services update-traffic <服務> --to-revisions=<版本>=100`） |
| 看 log | Cloud Run → 服務 → 記錄，或 `gcloud run services logs read <服務> --region=$REGION` |
| 換 secret | `gcloud secrets versions add ...` 後重新部署（或 push 一次） |

## 費用與限制

- Cloud Run 沒流量時縮到 0，活動期間才計費；第一次請求會有數秒冷啟動。活動當天如需避免冷啟動，可暫時把 checkin、rollcall、registration 設 `--min-instances=1`
- 經由入口轉送的請求，會在 registration 與目的服務各計一次
