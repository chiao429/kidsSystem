#!/usr/bin/env bash
# kidsSystem 一鍵 GCP 設定（可重複執行：已存在的資源會略過）
#
#   bash scripts/gcp-setup.sh
#
# 事前：安裝 gcloud 並執行 gcloud auth login。
# 若已安裝 GitHub CLI（gh）並登入，會自動寫入 GitHub Environments 的變數；否則最後印出讓你手動貼上。
set -euo pipefail

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask <變數名> <問題> [預設值]
  local __v; read -r -p "  $2${3:+ [$3]}: " __v
  printf -v "$1" '%s' "${__v:-${3:-}}"
}
ask_secret() { local __v; read -r -s -p "  $2: " __v; echo; printf -v "$1" '%s' "$__v"; }

command -v gcloud >/dev/null || die "找不到 gcloud。請先安裝：https://cloud.google.com/sdk/docs/install"
command -v openssl >/dev/null || die "找不到 openssl"
ACCOUNT=$(gcloud config get-value account 2>/dev/null || true)
[ -n "$ACCOUNT" ] || die "尚未登入 gcloud，請先執行：gcloud auth login"

say "基本資料（直接按 Enter 使用 [ ] 內的預設值）"
echo "  目前登入的 Google 帳號：$ACCOUNT"
ask PROJECT_ID "GCP 專案 ID" "$(gcloud config get-value project 2>/dev/null || true)"
[ -n "$PROJECT_ID" ] || die "需要 GCP 專案 ID"
ask REGION "區域" "asia-east1"
ask REPO "GitHub repo（owner/name）" "chiao429/kidsSystem"
ask KEY_FILE "Google Sheets service account 金鑰 JSON 檔路徑（沒有檔案直接按 Enter，改用 apps/admin/.env.local 裡的金鑰）" ""
KEY_FILE=${KEY_FILE//\\ / }   # 拖曳檔案時路徑中的「\ 」還原成空白
KEY_FILE=${KEY_FILE%\"}; KEY_FILE=${KEY_FILE#\"}; KEY_FILE=${KEY_FILE%\'}; KEY_FILE=${KEY_FILE#\'}
KEY_FILE=${KEY_FILE% }
if [ -z "$KEY_FILE" ]; then
  ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/apps/admin/.env.local"
  [ -f "$ENV_FILE" ] || die "找不到 $ENV_FILE，請改提供金鑰 JSON 檔"
  KEY_FILE=$(mktemp)
  trap 'rm -f "$KEY_FILE"' EXIT
  # 從 .env.local 組出暫時的金鑰 JSON（結束時自動刪除）
  python3 - "$ENV_FILE" "$KEY_FILE" <<'PY' || die "apps/admin/.env.local 缺少 GOOGLE_SERVICE_ACCOUNT_EMAIL 或 GOOGLE_PRIVATE_KEY"
import json, sys
vals = {}
for line in open(sys.argv[1], encoding='utf8'):
    line = line.strip()
    if '=' not in line or line.startswith('#'):
        continue
    k, v = line.split('=', 1)
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
        v = v[1:-1]
    vals[k.strip()] = v
email = vals.get('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
key = vals.get('GOOGLE_PRIVATE_KEY', '').replace('\\n', '\n')
if not email or 'PRIVATE KEY' not in key:
    sys.exit(1)
json.dump({'client_email': email, 'private_key': key}, open(sys.argv[2], 'w'))
PY
  ok "使用 apps/admin/.env.local 的金鑰"
fi
[ -f "$KEY_FILE" ] || die "找不到金鑰檔：$KEY_FILE"
SA_EMAIL=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["client_email"])' "$KEY_FILE")
ok "Sheets service account：$SA_EMAIL"

echo
echo "  staging（測試環境）與 production（正式環境）各需要："
echo "  - MongoDB 連線網址（Atlas → Connect → Drivers，mongodb+srv://...）"
echo "  - 主資料試算表 ID（試算表網址 /d/ 和 /edit 中間那段；試算表要共用給上面的 service account）"
ask_secret MONGO_STG "staging 的 MongoDB 連線網址（輸入時不顯示）"
ask SHEET_STG "staging 的主資料試算表 ID" ""
ask_secret MONGO_PROD "production 的 MongoDB 連線網址（可與 staging 相同，直接 Enter 沿用）"
MONGO_PROD=${MONGO_PROD:-$MONGO_STG}
ask SHEET_PROD "production 的主資料試算表 ID" "$SHEET_STG"
[ -n "$MONGO_STG" ] && [ -n "$SHEET_STG" ] || die "MongoDB 網址與試算表 ID 不可空白"

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
DEPLOY_SA="kids-deployer@$PROJECT_ID.iam.gserviceaccount.com"
RUNTIME_SA="kids-runtime@$PROJECT_ID.iam.gserviceaccount.com"
WIF_PROVIDER="projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"

say "1/6 啟用 GCP 服務（第一次約需 1～2 分鐘）"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com cloudscheduler.googleapis.com sts.googleapis.com iam.googleapis.com
ok "完成"

say "2/6 建立映像檔倉庫"
if gcloud artifacts repositories describe kids --location="$REGION" >/dev/null 2>&1; then ok "已存在"
else gcloud artifacts repositories create kids --repository-format=docker --location="$REGION" --quiet; ok "已建立"; fi

say "3/6 建立部署與執行用的帳號權限"
for name in kids-deployer kids-runtime; do
  if gcloud iam service-accounts describe "$name@$PROJECT_ID.iam.gserviceaccount.com" >/dev/null 2>&1; then ok "$name 已存在"
  else gcloud iam service-accounts create "$name" --quiet; ok "$name 已建立"; fi
done
bind() { gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$1" --role="$2" --condition=None --quiet >/dev/null; }
bind "$DEPLOY_SA" roles/run.admin
bind "$DEPLOY_SA" roles/artifactregistry.writer
bind "$RUNTIME_SA" roles/secretmanager.secretAccessor
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser --quiet >/dev/null
ok "權限設定完成"

say "4/6 讓 GitHub 可以登入 GCP（不需要存金鑰）"
if gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1; then ok "pool 已存在"
else gcloud iam workload-identity-pools create github --location=global --quiet; ok "pool 已建立"; fi
if gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers update-oidc github --location=global --workload-identity-pool=github \
    --attribute-condition="assertion.repository=='$REPO'" --quiet >/dev/null
  ok "provider 已存在（已更新為只允許 $REPO）"
else
  gcloud iam workload-identity-pools providers create-oidc github \
    --location=global --workload-identity-pool=github \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
    --attribute-condition="assertion.repository=='$REPO'" --quiet
  ok "provider 已建立"
fi
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$REPO" \
  --quiet >/dev/null
ok "只有 $REPO 的 GitHub Actions 可以部署"

say "5/6 存放密碼與金鑰（Secret Manager）"
put_secret() { # put_secret <名稱> <值>；已存在就不覆寫
  if gcloud secrets describe "$1" >/dev/null 2>&1; then ok "$1 已存在（保留原值）"
  else printf '%s' "$2" | gcloud secrets create "$1" --data-file=- --replication-policy=automatic --quiet >/dev/null; ok "$1 已建立"; fi
}
PRIVATE_KEY=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["private_key"],end="")' "$KEY_FILE")
for ENV in stg prod; do
  if [ "$ENV" = stg ]; then MONGO=$MONGO_STG; else MONGO=$MONGO_PROD; fi
  put_secret "kids-$ENV-auth-secret" "$(openssl rand -base64 36 | tr -d '\n')"
  put_secret "kids-$ENV-sync-token" "$(openssl rand -base64 36 | tr -d '\n=/+')"
  put_secret "kids-$ENV-mongodb-uri" "$MONGO"
  put_secret "kids-$ENV-google-private-key" "$PRIVATE_KEY"
done

say "6/6 每 5 分鐘同步到 Google Sheet（Cloud Scheduler）"
for ENV in stg prod; do
  URL="https://kids-$ENV-registration-$PROJECT_NUMBER.$REGION.run.app/admin/api/sync/push"
  TOKEN=$(gcloud secrets versions access latest --secret="kids-$ENV-sync-token")
  if gcloud scheduler jobs describe "kids-$ENV-sync" --location="$REGION" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "kids-$ENV-sync" --location="$REGION" --uri="$URL" \
      --update-headers="Authorization=Bearer $TOKEN" --quiet >/dev/null
    ok "kids-$ENV-sync 已更新"
  else
    gcloud scheduler jobs create http "kids-$ENV-sync" --location="$REGION" --schedule="*/5 * * * *" \
      --time-zone=Asia/Taipei --uri="$URL" --http-method=POST --headers="Authorization=Bearer $TOKEN" --quiet >/dev/null
    ok "kids-$ENV-sync 已建立（部署完成前呼叫會失敗，屬正常）"
  fi
done

# ── GitHub Environments 變數 ──
VARS_COMMON=(
  "GCP_PROJECT_ID=$PROJECT_ID"
  "GCP_PROJECT_NUMBER=$PROJECT_NUMBER"
  "GCP_REGION=$REGION"
  "WIF_PROVIDER=$WIF_PROVIDER"
  "DEPLOY_SA=$DEPLOY_SA"
  "RUNTIME_SA=$RUNTIME_SA"
  "GOOGLE_SERVICE_ACCOUNT_EMAIL=$SA_EMAIL"
  "DATA_BACKEND=mongo"
)

say "GitHub 設定"
if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  for ENV in staging production; do
    gh api -X PUT "repos/$REPO/environments/$ENV" >/dev/null
    if [ "$ENV" = staging ]; then EXTRA=("GOOGLE_MASTER_SHEET_ID=$SHEET_STG" "MONGODB_DB=kids_stg")
    else EXTRA=("GOOGLE_MASTER_SHEET_ID=$SHEET_PROD" "MONGODB_DB=kids"); fi
    for kv in "${VARS_COMMON[@]}" "${EXTRA[@]}"; do gh variable set "${kv%%=*}" --env "$ENV" --repo "$REPO" --body "${kv#*=}" >/dev/null; done
    ok "$ENV 環境變數已寫入"
  done
  warn "建議到 GitHub → Settings → Environments → production 勾選「Required reviewers」，正式部署前需要你按核准"
else
  warn "沒有安裝或登入 GitHub CLI（gh），請手動設定："
  echo "  GitHub → $REPO → Settings → Environments → New environment，建立 staging 與 production，"
  echo "  兩個環境都按「Add environment variable」逐一加入下列變數："
  echo
  for kv in "${VARS_COMMON[@]}"; do printf '    %-30s %s\n' "${kv%%=*}" "${kv#*=}"; done
  echo
  echo "  只有 staging："
  printf '    %-30s %s\n' GOOGLE_MASTER_SHEET_ID "$SHEET_STG" MONGODB_DB kids_stg
  echo "  只有 production："
  printf '    %-30s %s\n' GOOGLE_MASTER_SHEET_ID "$SHEET_PROD" MONGODB_DB kids
fi

ENTRY="https://kids-stg-registration-$PROJECT_NUMBER.$REGION.run.app"
say "完成！接下來"
cat <<EOF
  1. 到 GitHub → Actions → deploy → Run workflow（選 staging），或 push 任何修改到 main
  2. 部署完成後設定一次初始管理員密碼：
       gcloud run services update kids-stg-admin --region=$REGION --update-env-vars=ADMIN_BOOTSTRAP_PASSWORD=<自訂臨時密碼>
  3. 打開 $ENTRY/admin ，帳號 admin、密碼為上一步的臨時密碼，
     到「初始化」建立正式 admin 帳號後，移除臨時密碼：
       gcloud run services update kids-stg-admin --region=$REGION --remove-env-vars=ADMIN_BOOTSTRAP_PASSWORD

  staging 網址：$ENTRY
  同工入口：    $ENTRY/staff
EOF
