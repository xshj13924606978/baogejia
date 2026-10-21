#!/bin/bash
# 生产 standalone 启动脚本（本机 WSL，setsid 脱离会话，跨会话存活）
# 用法：bash scripts/prod-start.sh   （先 pnpm build）
set -e
NODE_BIN=/home/xshj/.nvm/versions/node/v24.19.0/bin/node
PROJ=/home/xshj/quote-project
cd "$PROJ/.next-production/standalone"
if [ ! -f server.js ]; then
  echo "缺少 $PROJ/.next-production/standalone/server.js，请先执行 pnpm build"
  exit 1
fi
# standalone 需要 static 静态资源目录（构建后从 .next-production/static 复制，幂等）
# 注意：distDir 隔离后 standalone 内构建目录名为 .next-production（与 distDir 同名）
if [ -d "$PROJ/.next-production/static" ] && [ ! -d "$PROJ/.next-production/standalone/.next-production/static" ]; then
  echo "同步 static 到 standalone..."
  cp -r "$PROJ/.next-production/static" "$PROJ/.next-production/standalone/.next-production/static"
fi
# standalone 需要 tesseract worker-script（Next 不追踪动态 worker 路径，#20260822-2242 固化，幂等）
if [ -d "$PROJ/node_modules/tesseract.js/src/worker-script" ] && [ ! -d "$PROJ/.next-production/standalone/.next-production/worker-script" ]; then
  echo "同步 worker-script 到 standalone..."
  mkdir -p "$PROJ/.next-production/standalone/.next-production/worker-script"
  cp -r "$PROJ/node_modules/tesseract.js/src/worker-script/." "$PROJ/.next-production/standalone/.next-production/worker-script/"
fi
# standalone 需要 public 静态资源目录（Next.js standalone 构建不复制 public，启动时同步，幂等）
# 注意：public 文件列表在启动时缓存，若仅复制不重启不会生效
if [ -d "$PROJ/public" ]; then
  mkdir -p "$PROJ/.next-production/standalone/public"
  cp -r "$PROJ/public/." "$PROJ/.next-production/standalone/public/"
fi
if [ -f "$PROJ/.prod.pid" ]; then
  OLD_PID=$(cat "$PROJ/.prod.pid")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "已在运行 PID=$OLD_PID"
    exit 0
  fi
fi
# 同步最新 .env.production（构建时 standalone 内为 build 时刻快照）
cp "$PROJ/.env.production" "$PROJ/.next-production/standalone/.env.production"
PORT=5000 HOSTNAME=0.0.0.0 NODE_ENV=production setsid "$NODE_BIN" server.js >> /tmp/quote-prod-standalone.log 2>&1 < /dev/null &
NEW_PID=$!
echo "$NEW_PID" > "$PROJ/.prod.pid"
echo "已启动 PID=$NEW_PID（日志 /tmp/quote-prod-standalone.log）"
sleep 3
curl -s -o /dev/null -w 'health 5000 HTTP:%{http_code}\n' --max-time 5 'http://127.0.0.1:5000/api/auth/oauth-url?provider=wechat' 2>&1 || true
