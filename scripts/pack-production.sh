#!/bin/bash
# ============================================================
# 生产打包脚本 #20260822-2100
# 用途：pnpm build 之后执行，生成发布 tgz（部署第一步）
#
# 背景：Next.js 16 standalone 的 public/ 仅按文件追踪（tracing）选择性复制，
#       manifest.json / icon-192.png 等未被引用的公共资源不会进包，
#       导致公网 404（如 /manifest.json）。本脚本强制同步完整 public。
#
# 用法：bash scripts/pack-production.sh
# 产物：release/quote-standalone-<TS>.tgz（已含 static + public 完整）
# 统一校验：tar tzf <包> | grep -c static/chunks 必须 > 0
# ============================================================
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== [1] 检查 build 产物 ==="
if [ ! -d ".next-production/standalone" ]; then
  echo "❌ .next-production/standalone 不存在，请先执行 pnpm build"
  exit 1
fi

echo "=== [2] 强制同步 public → standalone/public（完整，含 manifest.json/icon）==="
mkdir -p .next-production/standalone/public
cp -r public/. .next-production/standalone/public/
if [ ! -f ".next-production/standalone/public/manifest.json" ]; then
  echo "❌ 同步后仍缺 manifest.json"
  exit 1
fi
echo "✅ manifest.json 已同步"

echo "=== [3] 同步 static → standalone/.next-production/static ==="
mkdir -p .next-production/standalone/.next-production/static
cp -r .next-production/static/. .next-production/standalone/.next-production/static/
CHUNKS=$(ls .next-production/standalone/.next-production/static/chunks 2>/dev/null | wc -l)
echo "static/chunks 数量: $CHUNKS"

echo "=== [3.5] 补齐 tesseract worker-script（#20260822-2242 固化） ==="
# 背景：Next.js 不追踪 tesseract.js 动态 worker 路径，standalone 缺
#       worker-script 会 MODULE_NOT_FOUND → OCR 挂起。此处强制补齐。
WS_SRC=node_modules/tesseract.js/src/worker-script
WS_DST=.next-production/standalone/.next-production/worker-script
if [ ! -d "$WS_SRC" ]; then
  echo "❌ 未找到 $WS_SRC（tesseract.js 未安装？）"
  exit 1
fi
mkdir -p "$WS_DST"
cp -r "$WS_SRC/." "$WS_DST/"
if [ ! -f "$WS_DST/node/index.js" ]; then
  echo "❌ worker-script 同步后仍缺 node/index.js"
  exit 1
fi
echo "✅ worker-script 已补齐: $WS_DST"

echo "=== [4] 打包 ==="
TS=$(date +%Y%m%d-%H%M)
PKG="release/quote-standalone-${TS}.tgz"
mkdir -p release
tar -czf "$PKG" --exclude='.env*' -C .next-production/standalone .

echo "=== [5] 统一校验 ==="
N=$(tar tzf "$PKG" | grep -c 'static/chunks' || true)
M=$(tar tzf "$PKG" | grep -c 'public/manifest.json' || true)
W=$(tar tzf "$PKG" | grep -c 'worker-script/node/index.js' || true)
echo "static/chunks=$N  public/manifest.json=$M  worker-script=$W"
if [ "$N" -gt 0 ] && [ "$M" -gt 0 ] && [ "$W" -gt 0 ]; then
  echo "✅ 打包校验通过（static + public + worker-script 齐全）"
  echo "PKG=$PKG ($(du -h "$PKG" | cut -f1))"
else
  echo "❌ 打包校验失败"
  exit 1
fi