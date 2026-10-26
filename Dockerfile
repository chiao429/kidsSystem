# 六個 app 共用的映像檔：docker build --build-arg APP=checkin .
# NEXT_PUBLIC_* 會在 build 時寫進程式，所以由 build-arg 傳入；其餘設定在 Cloud Run 執行時注入。
FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/sheets-core/package.json packages/sheets-core/
COPY packages/auth/package.json packages/auth/
COPY packages/ui/package.json packages/ui/
COPY apps/admin/package.json apps/admin/
COPY apps/checkin/package.json apps/checkin/
COPY apps/data-tools/package.json apps/data-tools/
COPY apps/registration/package.json apps/registration/
COPY apps/rollcall/package.json apps/rollcall/
COPY apps/smallgroups/package.json apps/smallgroups/
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS build
ARG APP
ARG NEXT_PUBLIC_SITE_URL=""
ARG NEXT_PUBLIC_REGISTRATION_URL=""
ARG NEXT_PUBLIC_CHECKIN_URL=""
# registration（統一入口）的轉送目的地在 build 時決定（next.config.js 的 rewrites）
ARG ADMIN_ORIGIN=""
ARG CHECKIN_ORIGIN=""
ARG ROLLCALL_ORIGIN=""
ARG DATA_TOOLS_ORIGIN=""
ARG SMALLGROUPS_ORIGIN=""
ARG SITE_HOST=""
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_REGISTRATION_URL=$NEXT_PUBLIC_REGISTRATION_URL \
    NEXT_PUBLIC_CHECKIN_URL=$NEXT_PUBLIC_CHECKIN_URL \
    ADMIN_ORIGIN=$ADMIN_ORIGIN \
    CHECKIN_ORIGIN=$CHECKIN_ORIGIN \
    ROLLCALL_ORIGIN=$ROLLCALL_ORIGIN \
    DATA_TOOLS_ORIGIN=$DATA_TOOLS_ORIGIN \
    SMALLGROUPS_ORIGIN=$SMALLGROUPS_ORIGIN \
    SITE_HOST=$SITE_HOST
WORKDIR /repo
# 連同各 workspace 底下的 node_modules 一起帶過來（例如 packages/sheets-core/node_modules/mongodb）
COPY --from=deps /repo ./
COPY . .
RUN test -n "$APP" && npm run build -w @kids/$APP

FROM node:20-alpine AS run
ARG APP
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
WORKDIR /srv
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/$APP/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/$APP/.next/static ./apps/$APP/.next/static
# standalone 不含 public（頁尾標誌等靜態檔），另外複製；每個 app 都要有 public 資料夾
COPY --from=build --chown=app:app /repo/apps/$APP/public ./apps/$APP/public
USER app
ENV APP=$APP
EXPOSE 8080
CMD ["sh", "-c", "node apps/$APP/server.js"]
