#!/bin/bash
set -Eeuo pipefail

PORT=3000
COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"
NODE_ENV=development
DEPLOY_RUN_PORT=3000

cd "${COZE_WORKSPACE_PATH}"

kill_port_if_listening() {
    local pids
    pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
    if [[ -z "${pids}" ]]; then
      echo "Port ${DEPLOY_RUN_PORT} is free (WSL side)."
    else
      echo "Port ${DEPLOY_RUN_PORT} in use by WSL PIDs: ${pids} (SIGKILL)"
      echo "${pids}" | xargs -I {} kill -9 {}
      sleep 1
      pids=$(ss -H -lntp 2>/dev/null | awk -v port="${DEPLOY_RUN_PORT}" '$4 ~ ":"port"$"' | grep -o 'pid=[0-9]*' | cut -d= -f2 | paste -sd' ' - || true)
      if [[ -n "${pids}" ]]; then
        echo "Warning: port ${DEPLOY_RUN_PORT} still busy after SIGKILL, PIDs: ${pids}"
      else
        echo "Port ${DEPLOY_RUN_PORT} cleared (WSL side)."
      fi
    fi

    # Windows 宿主侧幽灵中继（#20260827-1000）：
    # WSL2 的 wslrelay.exe 会在 Windows 侧 127.0.0.1:${PORT} 上 LISTENING，
    # 即使 WSL 内对应进程已退出，残留中继仍占住端口 → is_occupied 误判"端口占用"导致 dev 永远起不来。
    # 此处一并清理（taskkill.exe /F），清理后由启动后的转发校验兜底。
    if grep -qi microsoft /proc/version 2>/dev/null && command -v netstat.exe >/dev/null 2>&1 && command -v taskkill.exe >/dev/null 2>&1; then
      local win_pids
      win_pids=$(netstat.exe -ano 2>/dev/null | grep "LISTENING" | grep ":${DEPLOY_RUN_PORT}[[:space:]]" | awk '{print $NF}' | sort -u | paste -sd' ' - || true)
      if [[ -n "${win_pids}" ]]; then
        echo "Port ${DEPLOY_RUN_PORT} held by Windows host relay PIDs: ${win_pids} (taskkill /F)"
        echo "${win_pids}" | xargs -I {} taskkill.exe /PID {} /F >/dev/null 2>&1 || true
        sleep 1
        win_pids=$(netstat.exe -ano 2>/dev/null | grep "LISTENING" | grep ":${DEPLOY_RUN_PORT}[[:space:]]" | awk '{print $NF}' | sort -u | paste -sd' ' - || true)
        if [[ -n "${win_pids}" ]]; then
          echo "Warning: Windows relay on port ${DEPLOY_RUN_PORT} still alive, PIDs: ${win_pids}"
        else
          echo "Windows relay on port ${DEPLOY_RUN_PORT} cleared."
        fi
      fi
    fi
}

# 检测端口是否被占用：WSL 侧 或 Windows 宿主侧（WSL2 下 netstat.exe 可看到宿主占用）
is_occupied() {
    local port="$1"
    if ss -H -lnt 2>/dev/null | awk -v p=":${port}" '$4 ~ p"$"' | grep -q .; then
      return 0
    fi
    if grep -qi microsoft /proc/version 2>/dev/null && command -v netstat.exe >/dev/null 2>&1; then
      if netstat.exe -ano 2>/dev/null | grep "LISTENING" | grep -q ":${port}[[:space:]]"; then
        return 0
      fi
    fi
    return 1
}

echo "Clearing port ${PORT} before start."
kill_port_if_listening

# 固定使用端口 3000：被占用时给出明确提示并退出，绝不自动切换端口
# WSL 环境下 Windows 宿主侧可能占用同一端口，Linux 侧的 ss 无法感知该占用，
# 需借助 netstat.exe 检测；检测到占用则明确报错，等待用户释放后重试
if is_occupied "${DEPLOY_RUN_PORT}"; then
    echo "❌ 端口 ${DEPLOY_RUN_PORT} 已被占用，dev 固定使用 http://localhost:3000，不会自动切换端口。"
    if grep -qi microsoft /proc/version 2>/dev/null && command -v netstat.exe >/dev/null 2>&1; then
        echo "   Windows 宿主侧占用（netstat.exe）："
        netstat.exe -ano 2>/dev/null | grep "LISTENING" | grep ":${DEPLOY_RUN_PORT}[[:space:]]" | head -10 || true
    fi
    echo "   请先释放该端口（Windows 侧结束占用进程 / WSL 侧 kill 对应 PID）后重新运行 pnpm dev。"
    exit 1
fi

# 清除 Next.js 缓存，避免模块解析问题
NEXT_CACHE_DIR="${COZE_WORKSPACE_PATH}/.next"
if [ -d "${NEXT_CACHE_DIR}" ]; then
    echo "Clearing Next.js cache to prevent module resolution issues..."
    rm -rf "${NEXT_CACHE_DIR}"
    echo "Next.js cache cleared."
fi

# WSL NAT IP：Windows 浏览器可通过该地址直连 WSL（宿主端口被占用时 localhost 转发会失效）
LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')" || LOCAL_IP="localhost"
[ -z "${LOCAL_IP}" ] && LOCAL_IP="localhost"

echo "Starting HTTP service on port ${DEPLOY_RUN_PORT} for dev..."
echo -e "\033[32m✅ 服务已启动！\033[0m"
echo "   WSL 直连地址（推荐）:  http://${LOCAL_IP}:${DEPLOY_RUN_PORT}"
echo "   Windows 本机地址:      http://localhost:${DEPLOY_RUN_PORT}"

# 使用 Turbopack dev：webpack dev 模式存在 manifest 竞态（HMR 重新编译期间
# loadManifest 读到半写的 JSON → "Unexpected end of JSON input" → API 偶发 500）
npx next dev --turbopack --port ${PORT} -H 0.0.0.0 &
DEV_PID=$!

# 启动后校验 Windows 侧 localhost 转发（#20260827-1000）：
# WSL2 的 wslrelay.exe 被强杀后，WSL 服务可能不再为该端口重建中继 → Windows 浏览器访问
# localhost:${PORT} 连不上（WSL 侧 curl 正常）。后台 12s 后检测 netstat.exe 是否出现
# 127.0.0.1:${PORT} LISTENING，未出现则给出修复指引（wsl --shutdown 重置 WSL 网络）。
( sleep 12
  if grep -qi microsoft /proc/version 2>/dev/null && command -v netstat.exe >/dev/null 2>&1; then
    if netstat.exe -ano 2>/dev/null | grep "LISTENING" | grep -q ":${DEPLOY_RUN_PORT}[[:space:]]"; then
      echo -e "\033[32m✅ Windows 侧 http://localhost:${DEPLOY_RUN_PORT} 转发正常\033[0m"
    else
      echo -e "\033[31m⚠️  Windows 侧 localhost:${DEPLOY_RUN_PORT} 转发未建立（wslrelay 未重启）。\033[0m"
      echo -e "\033[31m   修复：在 Windows 终端执行 wsl --shutdown 后，重新运行 pnpm dev。\033[0m"
    fi
  fi
) &

wait $DEV_PID
