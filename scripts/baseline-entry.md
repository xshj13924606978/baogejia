
---

## #[20260901-1510] 提交 + 生产部署完成（2026-09-01 17:16）

**提交：** `db7a3df`（fix 2 文件 +40/-3：src/components/recharge-dialog.tsx、HEALTH_BASELINE.md，全部本窗口改动；`next-env.d.ts` 为 dev 工具链自动改写已排除），已推送 cnb/main（GitHub origin 推送时 SSH 被代理阻断，部署后补推）。

**构建部署：**
- 本机 `bash scripts/build-production.sh`（NODE_OPTIONS=--max-old-space-size=6144）
- BUILD_ID=`u2oZavoBNoSlH11a0Hknb`，包 `release/quote-standalone-20260901-1712.tgz`
- **打包统一校验：** `tar tzf <包> | grep -c static/chunks = 1182 > 0` ✅
- `bash scripts/deploy-remote.sh`：备份 env → 原子切换 → 恢复 env → `pm2 restart quote-app`
- 回滚备份：`quote-app.bak-20260901-171406`

**验证（verify-deployment.sh）：7/7 全绿** — 本机产物✓、PM2 在线✓、BUILD_ID 一致✓、本地 5000✓、公网 register/login✓、/admin/points-rules✓、静态资源最新✓。

**生产 chunk 实证：** 新文案「我已完成支付，点击查询」与辅助说明「自动确认到账」已进入公网 chunk（app/page-b6d07ab95a93b9cc.js）✅；旧文案「我已支付完成」全 chunk 零残留 ✅。

**待用户最终验证：** 充值弹窗二维码页未支付时无绿色✓"已完成"视觉；手动查询按钮未支付 toast「尚未支付」；真实充值全链路（#[20260901-1140]）回归正常。
