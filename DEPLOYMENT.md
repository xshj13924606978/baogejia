# 部署流程文档

> 更新：2026-08-28（#[20260828-2020] 部署流程改为原子切换，杜绝部署空窗期静态资源 404）
> 本文件描述**真实生产拓扑**的部署流程。此前「生产 = 本机 WSL」的认知有误——真正的公网生产环境在腾讯云服务器上。

## 拓扑（2026-08-21 确认）

```
公网用户 → xs-bj.com / www.xs-bj.com (DNS → 193.112.123.218)
         → 腾讯云服务器 VM-0-4-ubuntu (Ubuntu, 用户 ubuntu)
             nginx 1.18.0 (443 ssl, 证书 /etc/nginx/ssl/xs-bj.com_bundle.crt)
             → 127.0.0.1:5000 → PM2 quote-app (standalone server.js)
             → 127.0.0.1:8000 → PM2 ocr-service
```

| 项 | 本机（开发） | 生产服务器 |
|---|---|---|
| 机器 | Windows + WSL (Ubuntu 24.04), `/home/xshj/quote-project` | 腾讯云 193.112.123.218, 用户 `ubuntu`, `/home/ubuntu/apps/quote-project` |
| SSH | — | `ssh ubuntu@193.112.123.218`（免密） |
| 进程管理 | `pnpm dev` / `scripts/local-standalone-start.sh`（本机验证用） | **PM2**（`quote-app` 端口 5000、`ocr-service` 端口 8000） |
| 构建产物 | `.next-production/`（standalone 模式） | `quote-app/`（standalone 解包目录） |
| 环境变量 | `.env.production`（本机） | `quote-app/.env.production`（**以服务器为准，部署时保留**） |

> 一键脚本（#20260902-1530，在本机 WSL 执行）：
> - `bash scripts/prod-start.sh` —— 构建 → 打包 → 远程部署 → 验证（验证失败自动回滚）
> - `bash scripts/prod-rollback.sh [--list]` —— 一键回滚到历史备份
> - `bash scripts/local-standalone-start.sh` —— 本机拉起 standalone 做部署前自检（原名 `prod-start.sh`，为免歧义已更名）
>
> ⚠️ 构建必须在**本机**完成：生产服务器仅 7GB 内存，而构建需 6GB heap（峰值 RSS 12GB），在服务器上 `pnpm build` 必 OOM。

## 部署步骤

### 0. 前置条件
- 本机已 `pnpm build`（产物在 `.next-production/standalone/`），本地验证通过（`bash scripts/local-standalone-start.sh` 或 `pnpm dev` 均可）。
- 可免密 SSH 登录生产服务器：`ssh ubuntu@193.112.123.218`。
- 磁盘注意：服务器 `df -h /` 需剩余 ≥ 1GB（当前约 10G，构建包约 60MB，解包约 200MB）。

### 1. 打包本机最新构建（排除 env，避免覆盖服务器配置）
```bash
cd /home/xshj/quote-project
# ⚠️ Next.js standalone 构建不复制 public/（manifest.json/icon/robots 等），
# 必须先把 public 同步进 standalone 再打包，否则公网静态资源全 404（见 #20260821-manifest-404）
mkdir -p .next-production/standalone/public
cp -r public/. .next-production/standalone/public/
tar czf /tmp/quote-standalone.tgz --exclude='.env*' -C .next-production/standalone .
# 校验部署包已含 manifest.json（防止复发）
tar tzf /tmp/quote-standalone.tgz | grep -c '^\./public/manifest.json$' && echo 'OK: 部署包含 public/manifest.json' || echo 'FAIL: 部署包缺 public/manifest.json，请检查！'
```

### 2. 上传到生产服务器
```bash
scp /tmp/quote-standalone.tgz ubuntu@193.112.123.218:/tmp/
```

### 3. 服务器部署（备份旧版 → 解包 → 保留 .env.production → 重启）
> ⚠️ **必须「先解包到临时目录、最后原子切换」**。旧写法 `mv quote-app quote-app.bak` 会把 PM2 正在服务的目录整体移走，随后 `tar` 解包耗时期间，`server.js`（`__dirname` 指向已被移走的目录）对 `/_next/static/*` 全部返回 404，公网用户会报 `ERR_ABORTED 404` + `ChunkLoadError`（见 #[20260828-2020]）。解包完成后再切换 + `pm2 restart`，空窗从「几十秒」缩到「毫秒（mv）+ 重启秒级」。

```bash
ssh ubuntu@193.112.123.218 'bash -s' <<'EOF'
set -e
cd /home/ubuntu/apps/quote-project
# 1. 备份当前 env（部署包已 --exclude='.env*'，必须从旧版恢复）
cp quote-app/.env.production /tmp/env.bak
# 2. 解包到临时目录（旧服务不受影响，全程无空窗）
rm -rf quote-app.new
mkdir quote-app.new
tar xzf /tmp/quote-standalone.tgz -C quote-app.new
cp /tmp/env.bak quote-app.new/.env.production
# 3. 原子切换（毫秒级；旧目录整体保留为回滚备份）
mv quote-app quote-app.bak-$(date +%Y%m%d-%H%M)
mv quote-app.new quote-app
# 4. 重启
pm2 restart quote-app --update-env
pm2 status quote-app
EOF
```

> ⚠️ **服务器 `quote-app/.env.production` 是唯一可信的生产配置**（含 `WECHAT_APP_ID`、`TENCENT_SMS_*`、Supabase key 等），切勿用本机 env 覆盖。

### 4. 验证（自动）
```bash
bash scripts/verify-deployment.sh
```

脚本逐项检查：本机构建产物 → 服务器 pm2 在线 → 服务器 BUILD_ID 与本机一致 → 服务器本地 5000 → 公网 register/login 200 → 公网 chunk hash 与最新构建一致。全部 ✅ 即为部署成功。

### 5. 回滚
```bash
ssh ubuntu@193.112.123.218 'bash -s' <<'EOF'
cd /home/ubuntu/apps/quote-project
rm -rf quote-app
mv quote-app.bak-<时间戳> quote-app
pm2 restart quote-app --update-env
EOF
```

## 部署后自动验证

部署后**必须**运行 `bash scripts/verify-deployment.sh`。为强制每次部署后自动验证，可在部署流程末尾追加（或配合 CI）：

```bash
bash scripts/verify-deployment.sh && echo "部署验证通过" || echo "部署验证失败，请检查！"
```

## 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 公网 register/login 200 但页面旧 | 服务器 `quote-app/` 仍是旧构建 | 重新打包上传，`pm2 restart quote-app --update-env` |
| 公网旧 chunk 404、新 chunk 200 | 新版已上线（旧资源被清） | 正常现象，说明已切换 |
| 部署期间 `_next/static/*` 全部 404 + `ChunkLoadError` | 部署脚本先 `mv quote-app` 再解包（空窗） | 改用原子切换（步骤 3 新流程）：先解包 `quote-app.new` 再 `mv` 切换 |
| 公网 oauth-url 404 | 旧构建无微信 OAuth 路由 | 重新部署新版（本文件流程） |
| 服务器磁盘不足 | 备份积累 | `du -sh /home/ubuntu/apps/quote-project/quote-app.bak-*`，删除旧备份 |
| 修改代码后公网无变化 | 本机未重新 build，或未上传/未重启 | 完整执行步骤 1→3→4 |

## 待办（与本部署流程相关的长期事项）

- 服务器 `.bak` 目录定期清理。
- 公网 443 证书有效期至 **2026-11-05**，到期前需续期并重载 nginx。
- 部署脚本可进一步接入 CI（cnb.cool / GitHub Actions），实现 push 后自动部署+验证。
