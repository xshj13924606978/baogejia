#!/bin/bash
# ============================================================
# PM2 standalone 形态备份脚本
# 对话窗: #[20260901-0900] P2-3（替代 deploy-server.sh 的 Docker 备份路径）
#
# 适配现网部署形态（scripts/build-production.sh + deploy-remote.sh）：
#   应用目录: $APP_DIR（默认 /home/ubuntu/apps/quote-project/quote-app）
#   进程管理: pm2 quote-app（端口 5000）
#
# 备份内容：
#   1. app.tar.gz      应用目录（.next-production standalone + package.json + ecosystem 配置）
#   2. env.production  环境变量（单独副本，便于快速恢复）
#   3. db/             数据库备份：
#                        a. 优先 pg_dump（需 DATABASE_URL + postgresql-client 可达）
#                        b. 不可用时降级为 Supabase REST 导出核心表 JSON
#                           （Supabase 实例仅 IPv6，pg_dump 通常不可达，平台另有托管备份）
#   4. backup-info.txt 元信息（时间 / pm2 状态 / BUILD_ID / 备份方式）
#
# 用法：
#   bash scripts/backup-pm2.sh              # 在服务器上执行一次备份
#   APP_DIR=/path APP_NAME=quote-app bash scripts/backup-pm2.sh
#
# 保留策略：最近 $MAX_BACKUPS 份（默认 10）
# ============================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/apps/quote-project/quote-app}"
APP_NAME="${APP_NAME:-quote-app}"
BACKUP_BASE="${BACKUP_BASE:-$(dirname "$APP_DIR")/backups}"
MAX_BACKUPS="${MAX_BACKUPS:-10}"
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
BACKUP_DIR="$BACKUP_BASE/$TIMESTAMP"

# 数据库 REST 导出所需（从应用 .env.production 读取，避免硬编码）
ENV_FILE="$APP_DIR/.env.production"

info() { echo "[INFO] $*"; }
ok()   { echo "[OK] $*"; }
warn() { echo "[WARN] $*"; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

echo "=========================================="
echo "  报个价 — PM2 应用备份"
echo "=========================================="

[ -d "$APP_DIR" ] || fail "应用目录不存在: $APP_DIR"
mkdir -p "$BACKUP_DIR/db"

BUILD_ID="$(cat "$APP_DIR/.next-production/BUILD_ID" 2>/dev/null || echo unknown)"
info "应用目录: $APP_DIR"
info "BUILD_ID: $BUILD_ID"
info "备份目录: $BACKUP_DIR"

# ---------- 1. 应用目录 ----------
info "打包应用目录（排除日志与临时文件）..."
tar -czf "$BACKUP_DIR/app.tar.gz" \
  --exclude='logs' \
  --exclude='tmp' \
  --exclude='*.log' \
  -C "$(dirname "$APP_DIR")" "$(basename "$APP_DIR")" 2>/dev/null \
  && ok "应用目录已备份 (app.tar.gz)" || warn "应用目录打包出现异常（请检查磁盘空间/权限）"

# ---------- 2. 环境变量 ----------
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKUP_DIR/env.production"
  ok "环境变量已备份"
else
  warn "未找到 $ENV_FILE，跳过环境变量备份"
fi

# ---------- 3. 数据库 ----------
# 从 .env.production 读取 Supabase 连接信息（不硬编码）
SUPABASE_URL=""; SUPABASE_KEY=""
if [ -f "$ENV_FILE" ]; then
  SUPABASE_URL="$(grep -E '^NEXT_PUBLIC_SUPABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
  SUPABASE_KEY="$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')"
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r' || true)"
fi

DB_BACKUP_MODE="none"
if [ -n "${DATABASE_URL:-}" ] && command -v pg_dump >/dev/null 2>&1; then
  info "尝试 pg_dump 全量备份..."
  if pg_dump "$DATABASE_URL" -f "$BACKUP_DIR/db/db.sql" 2>/dev/null; then
    ok "数据库已备份 (pg_dump → db/db.sql)"
    DB_BACKUP_MODE="pg_dump"
  else
    warn "pg_dump 执行失败（Supabase 仅 IPv6 时不可达），降级为 REST 导出"
  fi
fi

if [ "$DB_BACKUP_MODE" = "none" ]; then
  if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_KEY" ] && command -v curl >/dev/null 2>&1; then
    info "通过 Supabase REST 导出核心表 JSON..."
    CORE_TABLES="users user_levels user_token_balance point_logs payment_records quotes products trade_config member_levels member_field_permissions member_module_permissions migration_records business_reports"
    EXPORTED=0
    for table in $CORE_TABLES; do
      HTTP_CODE=$(curl -s -o "$BACKUP_DIR/db/${table}.json" -w '%{http_code}' --max-time 60 \
        -H "apikey: $SUPABASE_KEY" -H "Authorization: Bearer $SUPABASE_KEY" \
        "$SUPABASE_URL/rest/v1/${table}?select=*" 2>/dev/null || echo "000")
      if [ "$HTTP_CODE" = "200" ]; then
        EXPORTED=$((EXPORTED + 1))
      else
        rm -f "$BACKUP_DIR/db/${table}.json"
        warn "  表 $table 导出失败 (HTTP $HTTP_CODE)，已跳过"
      fi
    done
    if [ "$EXPORTED" -gt 0 ]; then
      ok "核心表 JSON 导出完成 ($EXPORTED 张表 → db/*.json)"
      DB_BACKUP_MODE="rest-json($EXPORTED)"
    else
      warn "REST 导出全部失败；数据库仅依赖 Supabase 平台托管备份"
    fi
  else
    warn "缺少 Supabase 连接信息或 curl，跳过数据库备份（依赖 Supabase 平台托管备份）"
  fi
fi

# ---------- 4. 元信息 ----------
PM2_STATUS="$(pm2 jlist 2>/dev/null | grep -o '"name":"'"$APP_NAME"'"[^}]*"status":"[a-z]*"' | grep -o '"status":"[a-z]*"' | head -1 | cut -d'"' -f4 || echo unknown)"
cat > "$BACKUP_DIR/backup-info.txt" << EOF
timestamp=$TIMESTAMP
app_dir=$APP_DIR
app_name=$APP_NAME
build_id=$BUILD_ID
pm2_status=$PM2_STATUS
db_backup_mode=$DB_BACKUP_MODE
size=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
EOF

ok "备份完成: $BACKUP_DIR ($(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1))"

# ---------- 5. 清理旧备份 ----------
BACKUP_COUNT=$(ls -1d "$BACKUP_BASE"/[0-9]* 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  TO_DELETE=$((BACKUP_COUNT - MAX_BACKUPS))
  info "清理 $TO_DELETE 个旧备份（保留最近 $MAX_BACKUPS 份）..."
  ls -1d "$BACKUP_BASE"/[0-9]* | sort | head -n "$TO_DELETE" | while read -r dir; do
    rm -rf "$dir"
    info "已删除: $dir"
  done
fi

echo "=========================================="
echo "  备份完成"
echo "  位置: $BACKUP_DIR"
echo "  恢复: bash scripts/restore-pm2.sh $TIMESTAMP"
echo "=========================================="
