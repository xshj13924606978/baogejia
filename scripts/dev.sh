#!/bin/bash
set -Eeuo pipefail

PORT=5000
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
NODE_ENV=development
DEPLOY_RUN_PORT=5000

cd "${COZE_WORKSPACE_PATH}"

kill_port_if_listening() {
    local pids
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -z "${pids}" ]]; then
      echo "Port ${DEPLOY_RUN_PORT} is free."
      return
    fi
    echo "Port ${DEPLOY_RUN_PORT} in use by PIDs: ${pids} (SIGKILL)"
    echo "${pids}" | xargs -I {} kill -9 {}
    sleep 1
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -n "${pids}" ]]; then
      echo "Warning: port ${DEPLOY_RUN_PORT} still busy after SIGKILL, PIDs: ${pids}"
    else
      echo "Port ${DEPLOY_RUN_PORT} cleared."
    fi
}

# WSL 环境下 Windows 宿主侧可能占用同一端口（例如系统服务 iphlpsvc 监听 5000），
# Linux 侧的 ss 无法感知该占用，需借助 netstat.exe 检测；检测到则自动切换备用端口
resolve_port_conflict() {
    if ! grep -qi microsoft /proc/version 2>/dev/null || ! command -v netstat.exe >/dev/null 2>&1; then
      return
    fi
    if netstat.exe -ano 2>/dev/null | grep "LISTENING" | grep -q ":${DEPLOY_RUN_PORT}[[:space:]]"; then
      echo "Port ${DEPLOY_RUN_PORT} is occupied on the Windows host side (cannot be killed from WSL)."
      DEPLOY_RUN_PORT=3000
      PORT=3000
      echo "Switched to fallback port ${DEPLOY_RUN_PORT} to continue dev."
      if netstat.exe -ano 2>/dev/null | grep "LISTENING" | grep -q ":${DEPLOY_RUN_PORT}[[:space:]]"; then
        echo "Error: fallback port ${DEPLOY_RUN_PORT} is also occupied on the Windows host side."
        exit 1
      fi
    fi
}

echo "Clearing port ${PORT} before start."
kill_port_if_listening
resolve_port_conflict

# 清除 Next.js 缓存，避免模块解析问题
NEXT_CACHE_DIR="${COZE_WORKSPACE_PATH}/.next"
if [ -d "${NEXT_CACHE_DIR}" ]; then
    echo "Clearing Next.js cache to prevent module resolution issues..."
    rm -rf "${NEXT_CACHE_DIR}"
    echo "Next.js cache cleared."
fi

echo "Starting HTTP service on port ${PORT} for dev..."

npx next dev --webpack --port $PORT -H 0.0.0.0
