#!/bin/bash
# ============================================================
# PM2 standalone 形态恢复脚本
# 对话窗: #[20260901-0900] P2-3（替代 deploy-server.sh 的 Docker 恢复路径）
#
# 恢复流程：
#   1. 列出可用备份（不带参数时）
#   2. pm2 stop 应用
#   3. 当前应用目录整体移至回滚区（quote-app.rollback-<ts>，可二次回滚）
#   4. 解包备份 → 恢复 .env.production → pm2 restart
#   5. 健康检查（127.0.0.1:5000）
#
# 用法：
#   bash scripts/restore-pm2.sh                 # 列出可用备份
#   bash scripts/restore-pm2.sh <备份目录名>     # 交互确认后恢复
#   bash scripts/restore-pm2.sh <备份目录名> --yes   # 跳过确认（自动化）
#
# 注意：数据库恢复不在本脚本范围——pg_dump 备份用 psql 恢复；
#       REST JSON 备份为只读快照，生产数据库的时点恢复请使用 Supabase 平台 PITR。
# ============================================================
set -uo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/apps/quote-project/quote-app}"
APP_NAME="${APP_NAME:-quote-app}"
BACKUP_BASE="${BACKUP_BASE:-$(dirname "$APP_DIR")/backups}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:5000/register}"

info() { echo "[INFO] $*"; }
ok()   { echo "[OK] $*"; }
warn() { echo "[WARN] $*"; }
fail() { echo "[ERROR] $*" >&2; exit 1; }

BACKUP_NAME="${1:-}"
ASSUME_YES="${2:-}"

# ---------- 列出可用备份 ----------
if [ -z "$BACKUP_NAME" ]; then
  if [ ! -d "$BACKUP_BASE" ] || [ -z "$(ls -A "$BACKUP_BASE" 2>/dev/null)" ]; then
    fail "没有可用的备份 ($BACKUP_BASE)"
  fi
  echo "=========================================="
  echo "  报个价 — 可用备份"
  echo "=========================================="
  for dir in $(ls -1d "$BACKUP_BASE"/[0-9]* 2>/dev/null | sort -r); do
    INFO_FILE="$dir/backup-info.txt"
    BUILD="?"; SIZE=$(du -sh "$dir" 2>/dev/null | cut -f1)
    if [ -f "$INFO_FILE" ]; then
      BUILD=$(grep '^build_id=' "$INFO_FILE" | cut -d= -f2)
    fi
    printf "  %-20s  build: %-22s  size: %s\n" "$(basename "$dir")" "$BUILD" "$SIZE"
  done
  echo ""
  echo "用法: bash $0 <备份目录名> [--yes]"
  exit 0
fi

RESTORE_DIR="$BACKUP_BASE/$BACKUP_NAME"
[ -d "$RESTORE_DIR" ] || fail "备份不存在: $RESTORE_DIR"
[ -f "$RESTORE_DIR/app.tar.gz" ] || fail "备份缺少 app.tar.gz: $RESTORE_DIR"

echo "=========================================="
echo "  报个价 — PM2 应用恢复"
echo "=========================================="
if [ -f "$RESTORE_DIR/backup-info.txt" ]; then
  echo "备份信息:"
  cat "$RESTORE_DIR/backup-info.txt"
  echo ""
fi

# ---------- 确认 ----------
if [ "$ASSUME_YES" != "--yes" ]; then
  read -p "确认恢复此备份？当前应用将被替换 (y/N): " CONFIRM
  if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    info "已取消"
    exit 0
  fi
fi

# ---------- 1. 停服 ----------
info "停止应用 ($APP_NAME)..."
pm2 stop "$APP_NAME" 2>/dev/null || warn "pm2 stop 失败（进程可能不存在）"

# ---------- 2. 当前版本移至回滚区 ----------
ROLLBACK_DIR="${APP_DIR}.rollback-$(date '+%Y%m%d_%H%M%S')"
if [ -d "$APP_DIR" ]; then
  # 保留当前 .env.production（备份内也有，但以防备份缺 env）
  if [ -f "$APP_DIR/.env.production" ]; then
    cp "$APP_DIR/.env.production" /tmp/.env.production.restore-bak 2>/dev/null || true
  fi
  mv "$APP_DIR" "$ROLLBACK_DIR"
  ok "当前应用已移至回滚区: $ROLLBACK_DIR"
fi

# ---------- 3. 解包备份 ----------
info "解包备份..."
mkdir -p "$(dirname "$APP_DIR")"
if ! tar -xzf "$RESTORE_DIR/app.tar.gz" -C "$(dirname "$APP_DIR")"; then
  warn "解包失败，尝试从回滚区恢复..."
  [ -d "$ROLLBACK_DIR" ] && mv "$ROLLBACK_DIR" "$APP_DIR"
  pm2 restart "$APP_NAME" 2>/dev/null || true
  fail "备份解包失败，已回退到恢复前状态"
fi
ok "应用文件已恢复"

# ---------- 4. 恢复环境变量 ----------
if [ -f "$RESTORE_DIR/env.production" ]; then
  cp "$RESTORE_DIR/env.production" "$APP_DIR/.env.production"
  ok "环境变量已从备份恢复"
elif [ -f /tmp/.env.production.restore-bak ]; then
  cp /tmp/.env.production.restore-bak "$APP_DIR/.env.production"
  warn "备份中无环境变量，已沿用恢复前的 .env.production"
else
  warn "未找到 .env.production，请手动检查应用配置！"
fi

# ---------- 5. 重启 + 健康检查 ----------
info "重启应用..."
pm2 restart "$APP_NAME" 2>/dev/null || pm2 start "$APP_NAME" 2>/dev/null || fail "pm2 启动失败"

sleep 8
HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$HEALTH_URL" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
  ok "健康检查通过 ($HEALTH_URL → $HTTP_CODE)"
  echo ""
  echo "恢复完成。如需再次回滚，回滚区位于: $ROLLBACK_DIR"
else
  warn "健康检查未通过 ($HEALTH_URL → $HTTP_CODE)"
  warn "请检查: pm2 logs $APP_NAME --lines 50"
  warn "如需回退: pm2 stop $APP_NAME && rm -rf $APP_DIR && mv $ROLLBACK_DIR $APP_DIR && pm2 restart $APP_NAME"
  exit 1
fi
