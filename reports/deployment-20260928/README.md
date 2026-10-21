# 正式发布与验收记录（2026-09-28）

状态：DEPLOYED_AND_SCOPED_ACCEPTANCE_PASSED。本轮已实际应用到 https://xs-bj.com，并非仅本地修复。

## 发布对象
- 发布标识：health-20260928-145003
- 新 BUILD_ID：Kbz0sj5NhKzTgdCWmlHJE
- 原 BUILD_ID：7iC9-mjjrYx6bOCaovUaL
- 生产 Next.js：16.3.6
- 发布包：/home/xshj/quote-project-v2-e1-migration-runner/release/quote-standalone-20260928-1449.tgz
- 发布包 SHA256：39ab4fde79e82167c9210f1f1f1006e773161c0fa9ec2b535d152d40bcd71660
- 生产目录：/home/ubuntu/apps/quote-project/quote-app
- 完整旧目录备份：/home/ubuntu/apps/quote-project/quote-app.backup-health-20260928-145003

## 核对与部署
1. SSH 公钥登录恢复。生产旧构建 ID 与本机旧产物一致；2,413 个服务端文件、12 个公开脚本逐字节相同；21 个附加 Python/公开资源与候选源文件一致，无未知差异。
2. 新鉴权需要的 users 字段只读 HEAD 检查 200；生产进程不存在与 .env.production 冲突的同名变量。未读取用户记录作为测试账户。
3. 使用服务器真实配置正式构建，退出 0。构建时通过既有实例守卫禁用调度器。生产配置仅存于权限受限临时目录，不加入包。645 个客户端脚本未检出所检查的生产私密配置值。
4. 发布包路径、链接边界及配置文件排除检查通过。上传后哈希再次匹配。在独立目录、回环端口 5001 预检，新实例禁用调度器：原生依赖、健康、登录注册页、无效鉴权拒绝均通过，然后关闭测试进程。
5. 保留 .env.production、OCR 语言包、openclaw-env、缓存与旧静态资源。备份旧目录，切换并重启原 PM2 应用。自动回退保护已部署，本次未触发回退。
6. 上线后 2,157 个服务端产物与本次包对应文件全部一致。生产配置与备份逐字节一致。PM2 应用在线，重启计数由 12 到 13（本次计划重启一次）；最后观察已运行 177 秒，未新增重启。OCR 进程未重启。

## 验收结果
- 公网验收 28/28：页面、www 登录页、健康接口、会话拒绝、管理员登录跳转、无效管理员凭证拒绝、禁用迁移入口 410，以及 16 个脚本哈希对应。
- 健康接口确认数据库查询可达、PDF/OCR 命令存在。其 storage 字段是实现中的固定标记，本次不据此宣称对象存储读写已验证。
- 首次公网脚本误将管理员无凭证请求预期为 401，并自动跟随跳转得到登录页 200，记录保留于 live-verification-initial.json。根据现有代理契约，改为禁跟随并断言 307 及登录 Location；另增加无效 token 必须 401。最终 28/28，未修改产品逻辑迁就测试。
- 上线候选与已测试文件哈希一致；此前 484 项测试通过，本轮未无意义重复。新增正式生产构建、类型检查、服务器预检和公网验收均成功。
- 本次没有执行数据库迁移、initdb 或迁移 harness 唯一运行尝试；没有改 FINAL/IMMUTABLE 或 54 锁区域。迁移工具验收与网站发布是不同对象，不把锁数量当作网站业务覆盖。

## 已发布内容
本分支既往产品修复（包括旧迁移 HTTP 入口禁用、产品字段与管理员相关修复）及本轮鉴权 fail-closed、账号归属验证、会话撤销/账号状态检查、数据库角色同步、Socket 验证与依赖更新。源码绑定清单：release-source-sha256.json。两份历史审核补丁保留，不作为完整生产包；新版本实际由当前源码构建的 standalone 发布。

## 边界与遗留
尚未使用真实账户执行登录、支付、上传、报价、管理员写操作等完整业务流程；未做破坏性/压力测试。依赖审计仍有 5 high / 1 moderate（详情见 ../health-20260928/README.md），未宣称全部消除。ancestor/TOCTOU 与部署权限契约问题沿用原范围结论。PM2 单实例重启存在短暂连接窗口，日志中的首次连接拒绝发生于启动阶段，后续重试成功；不宣称零停机。不能保证项目永久零 bug。

## 回退
已核验脚本位于服务器 releases/health-20260928-145003.verified.sh，支持 rollback 模式，会先核对新旧构建编号再恢复旧目录。当前工作区可使用 python3 reports/deployment-20260928/run-release.py rollback 执行；这是实际回退动作，当前未执行。不要删除备份。服务器配置是权威来源，不由本地主项目旧配置覆盖。

## 证据
release.json、production-build.txt、package.txt、prepare.txt、activate.txt、remote-before.json、remote-after.json、server-artifact-comparison.json、runtime-source-comparison.json、schema-check.txt、pm2-env-check.txt、process-after.json、live-verification.json、client-secret-check.json、summary.json。SHA256SUMS 绑定本目录报告文件。
