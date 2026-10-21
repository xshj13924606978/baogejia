#!/bin/bash
# ============================================================
# OCR Service 启动脚本（本地开发环境）
# 使用已有 venv（/tmp/ocr-venv）或自动创建
# 用法：bash scripts/start-ocr-service.sh [port]
#   默认端口 8000（与应用 .env.local 中 OCR_SERVICE_URL 一致）
# ============================================================
set -e

cd "$(dirname "$0")/../ocr-service"

PORT="${1:-8000}"
VENV="${OCR_VENV:-/tmp/ocr-venv}"
LOG_FILE="/tmp/ocr-service-${PORT}.log"
PID_FILE="/tmp/ocr-service-${PORT}.pid"

# 1. 准备 venv
if [ ! -x "$VENV/bin/python" ]; then
  echo ">>> 创建 Python venv: $VENV"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -i https://mirrors.aliyun.com/pypi/simple/ \
    -r requirements.txt
fi

# 2. 若已在运行则直接提示
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo ">>> OCR Service 已在运行 (PID=$(cat "$PID_FILE"), port=$PORT)"
  curl -s "http://127.0.0.1:${PORT}/health" && echo ""
  exit 0
fi

# 3. 清理残留端口占用（避免误杀其他进程，只检查端口）
if ss -tln | grep -q "127.0.0.1:${PORT}"; then
  echo ">>> 端口 ${PORT} 已被占用，尝试重启..."
  OLD_PID=$(ss -tlnp | grep "127.0.0.1:${PORT}" | grep -oP 'pid=\K[0-9]+' | head -1)
  [ -n "$OLD_PID" ] && kill "$OLD_PID" && sleep 2
fi

# 4. 启动
nohup "$VENV/bin/python" -m uvicorn app:app \
  --host 127.0.0.1 --port "$PORT" \
  > "$LOG_FILE" 2>&1 &
disown $!
echo $! > "$PID_FILE"
echo ">>> OCR Service 已启动 (PID=$(cat "$PID_FILE"), port=$PORT)"
echo ">>> 日志: $LOG_FILE"

# 5. 等待就绪
for i in $(seq 1 30); do
  if curl -s "http://127.0.0.1:${PORT}/health" > /dev/null 2>&1; then
    echo ">>> 就绪: $(curl -s http://127.0.0.1:${PORT}/health)"
    exit 0
  fi
  sleep 1
done

echo ">>> 启动超时，请检查日志: $LOG_FILE"
exit 1
