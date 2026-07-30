#!/bin/bash
# ============================================================================
# 一键部署脚本 — 腾讯云轻量服务器
# 用法: bash deploy-server.sh [--init] [--deploy] [--update] [--ssl DOMAIN]
#   --init   : 初始化服务器环境（只需执行一次）
#   --deploy : 首次部署（克隆代码 + Docker 构建 + Nginx 配置）
#   --update : 更新部署（拉取最新代码 + 重新构建）
#   --ssl    : 配置 HTTPS（需要已备案域名）
# ============================================================================

set -eo pipefail

# --- 颜色 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_DIR="/opt/quote-system"
APP_PORT=5000

# --- 工具函数 ---
info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }

check_root() {
  if [ "$EUID" -ne 0 ]; then
    fail "请使用 sudo 运行此脚本: sudo bash deploy-server.sh $1"
  fi
}

# ============================================================================
# --init : 初始化服务器环境
# ============================================================================
do_init() {
  check_root
  echo "=========================================="
  echo "  报个价 — 服务器环境初始化"
  echo "=========================================="

  info "更新系统包..."
  apt update -qq && apt upgrade -y -qq

  info "安装 Docker、Nginx、Certbot、Git..."
  apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx git

  info "启动 Docker..."
  systemctl enable docker --quiet
  systemctl start docker

  # 配置 swap（2G 服务器内存不够）
  if [ ! -f /swapfile ]; then
    info "配置 2G swap..."
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile > /dev/null
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "Swap 已配置"
  else
    ok "Swap 已存在，跳过"
  fi

  # 创建应用目录
  mkdir -p "$APP_DIR"
  chown "$SUDO_USER":"$SUDO_USER" "$APP_DIR"

  # 防火墙放行端口
  if command -v ufw &> /dev/null; then
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    ufw --force enable
    ok "防火墙已配置"
  fi

  echo ""
  ok "服务器环境初始化完成！"
  echo ""
  echo "下一步："
  echo "  sudo bash deploy-server.sh --deploy"
}

# ============================================================================
# --deploy : 首次部署
# ============================================================================
do_deploy() {
  check_root
  echo "=========================================="
  echo "  报个价 — 首次部署"
  echo "=========================================="

  # 克隆代码
  if [ -d "$APP_DIR/.git" ]; then
    warn "代码目录已存在，跳过克隆。如需重新克隆请先删除 $APP_DIR"
  else
    info "克隆代码..."
    git clone https://github.com/xshj13924606978/quote-system.git "$APP_DIR"
    cd "$APP_DIR"
    git checkout develop
    ok "代码克隆完成"
  fi

  cd "$APP_DIR"

  # 检查环境变量
  if [ ! -f .env.production ]; then
    if [ -f .env.example ]; then
      cp .env.example .env.production
      warn ".env.production 已从 .env.example 复制"
      warn "请编辑 .env.production 填入实际的 API Key："
      warn "  nano $APP_DIR/.env.production"
      warn ""
      warn "必须配置的变量："
      warn "  SESSION_TOKEN_SECRET（运行 openssl rand -base64 48 生成）"
      warn "  DEEPSEEK_API_KEY"
      warn "  NEXT_PUBLIC_APP_URL（设为 https://xs-bj.com）"
      echo ""
      read -p "按 Enter 确认已配置好环境变量，或 Ctrl+C 退出编辑..."
    else
      fail ".env.example 不存在，无法创建 .env.production"
    fi
  fi

  # Docker 构建
  info "Docker 构建（首次约需 5-10 分钟）..."
  docker compose up -d --build

  # 等待启动
  info "等待应用启动..."
  sleep 10

  # 健康检查
  do_health_check

  # 配置 Nginx
  do_nginx_http

  echo ""
  ok "部署完成！"
  echo ""
  echo "访问地址："
  local IP=$(curl -s4 ifconfig.me 2>/dev/null || echo "你的服务器IP")
  echo "  http://$IP"
  echo ""
  echo "后续操作："
  echo "  更新代码: sudo bash $0 --update"
  echo "  配置 HTTPS: sudo bash $0 --ssl xs-bj.com"
  echo "  查看日志:  cd $APP_DIR && docker compose logs -f"
  echo "  重启服务:  cd $APP_DIR && docker compose restart"
}

# ============================================================================
# --update : 更新部署
# ============================================================================
do_update() {
  check_root
  cd "$APP_DIR"

  info "拉取最新代码..."
  git pull origin develop

  info "重新构建并启动..."
  docker compose up -d --build

  info "清理旧镜像..."
  docker image prune -f

  sleep 10
  do_health_check

  ok "更新完成！"
}

# ============================================================================
# --ssl DOMAIN : 配置 HTTPS
# ============================================================================
do_ssl() {
  local DOMAIN="$1"
  if [ -z "$DOMAIN" ]; then
    fail "用法: sudo bash $0 --ssl your-domain.com"
  fi

  check_root
  info "配置 HTTPS: $DOMAIN"

  # 先确保 DNS 已指向本机
  local IP=$(curl -s4 ifconfig.me 2>/dev/null)
  info "服务器 IP: $IP"
  info "请确认 $DOMAIN 的 DNS A 记录已指向 $IP"
  read -p "按 Enter 继续，或 Ctrl+C 退出检查 DNS..."

  # 写入 Nginx 配置
  tee /etc/nginx/sites-available/"$DOMAIN" > /dev/null << NGINX
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    server_name $DOMAIN www.$DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/"$DOMAIN" /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default

  # 获取证书
  info "申请 SSL 证书..."
  certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos -m admin@"$DOMAIN"

  nginx -t && systemctl reload nginx

  ok "HTTPS 配置完成！访问: https://$DOMAIN"
}

# ============================================================================
# 内部：健康检查
# ============================================================================
do_health_check() {
  local retries=0
  local max_retries=12

  while [ $retries -lt $max_retries ]; do
    if curl -sf "http://localhost:$APP_PORT" > /dev/null 2>&1; then
      ok "应用已正常运行 (localhost:$APP_PORT)"
      return 0
    fi
    retries=$((retries + 1))
    sleep 5
  done

  warn "应用未在预期时间内响应，查看日志排查:"
  warn "  cd $APP_DIR && docker compose logs --tail 50"
  return 1
}

# ============================================================================
# 内部：配置 Nginx HTTP 反向代理
# ============================================================================
do_nginx_http() {
  info "配置 Nginx HTTP 反向代理..."
  tee /etc/nginx/sites-available/quote-app > /dev/null << NGINX
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX

  ln -sf /etc/nginx/sites-available/quote-app /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
  ok "Nginx 已配置"
}

# ============================================================================
# 入口
# ============================================================================
case "${1:-}" in
  --init)   do_init   ;;
  --deploy) do_deploy ;;
  --update) do_update ;;
  --ssl)    do_ssl "$2" ;;
  *)
    echo ""
    echo "报个价 — 自动化部署脚本"
    echo ""
    echo "用法: sudo bash $0 <command>"
    echo ""
    echo "命令:"
    echo "  --init            初始化服务器环境（只需一次）"
    echo "  --deploy          首次部署（克隆代码 + 构建 + Nginx）"
    echo "  --update          更新部署（拉取代码 + 重新构建）"
    echo "  --ssl <domain>    配置 HTTPS（需要已备案域名）"
    echo ""
    echo "示例（首次完整流程）:"
    echo "  sudo bash $0 --init"
    echo "  sudo bash $0 --deploy"
    echo "  sudo bash $0 --ssl xs-bj.com"
    echo ""
    echo "日常更新:"
    echo "  sudo bash $0 --update"
    ;;
esac
