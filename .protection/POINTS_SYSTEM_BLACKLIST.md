# ⚠️ 积分系统黑名单 - 禁止优化！

## 🔒 锁定说明

这些文件是积分系统的核心，已经稳定运行（版本 cf68f5e），**禁止任何优化修改**！

### 📄 黑名单文件列表

| 文件 | 功能 | 保护原因 |
|------|------|----------|
| `src/lib/user-level-service.ts` | 用户等级核心逻辑 | 积分计算核心 |
| `src/storage/database/points-utils.ts` | 积分数据库工具 | 数据操作核心 |
| `src/app/api/points/route.ts` | 积分管理API | 业务接口 |
| `src/app/api/points/exchange/route.ts` | 积分兑换API | 兑换逻辑 |
| `src/app/api/user/points/route.ts` | 用户积分API | 用户积分操作 |
| `src/app/api/user/level/route.ts` | 用户等级API | 等级查询 |
| `src/app/api/user/level/check-upgrade/route.ts` | 检查升级API | 升级检测 |
| `src/app/api/user/level/exchange/route.ts` | 等级兑换API | 等级兑换 |
| `src/app/api/user/level/history/route.ts` | 升级历史API | 历史记录 |
| `src/app/api/user/level/purchase/route.ts` | 等级购买API | 购买逻辑 |
| `src/app/api/user/level/recommendation/route.ts` | 等级推荐API | 推荐系统 |
| `src/app/api/admin/points/logs/route.ts` | 管理员积分日志API | 日志查询 |
| `src/app/api/admin/levels/route.ts` | 管理员等级API | 等级管理 |
| `src/app/api/admin/levels/[level]/route.ts` | 特定等级API | 等级详情 |
| `src/app/api/admin/levels/[level]/history/route.ts` | 等级历史API | 历史管理 |
| `src/app/api/admin/levels/batch/route.ts` | 批量操作API | 批量处理 |
| `src/app/api/admin/levels/defaults/route.ts` | 默认配置API | 配置管理 |
| `src/components/points-panel.tsx` | 积分面板组件 | 用户界面 |
| `src/components/user/points-panel.tsx` | 用户积分面板组件 | 用户界面 |
| `src/components/user/points-mall.tsx` | 积分商城组件 | 商城界面 |
| `src/components/admin/points/PointsConfig.tsx` | 积分配置组件 | 管理界面 |
| `src/components/admin/points/PointsLog.tsx` | 积分日志组件 | 日志界面 |
| `src/components/admin/points/PointsManagement.tsx` | 积分管理组件 | 管理界面 |
| `src/components/admin/levels/LevelEditor.tsx` | 等级编辑器组件 | 编辑界面 |
| `src/components/admin/levels/LevelList.tsx` | 等级列表组件 | 列表界面 |
| `src/components/ui/progress.tsx` | 进度条组件 | UI组件 |

## 🚫 禁止的优化操作

❌ **不要重构**这些文件的代码结构
❌ **不要重命名**变量、函数、类
❌ **不要修改**代码格式（换行、空格等）
❌ **不要升级**相关依赖版本
❌ **不要拆分**或合并文件
❌ **不要优化**性能（除非必要）
❌ **不要删除**任何代码
❌ **不要添加**新功能到这些文件

## ✅ 允许的操作（需审批）

✅ **修复严重bug**（需测试验证）
  - 必须先在测试环境验证
  - 必须写明修复原因
  - 必须更新哈希快照

✅ **安全补丁**（需说明原因）
  - 必须说明安全漏洞
  - 必须提供补丁说明
  - 必须更新哈希快照

✅ **其他修改**
  - 必须使用 `--no-verify` 强制提交
  - 必须在 commit 信息中注明原因
  - 必须更新哈希快照

## 🔒 保护机制

### 1. Git 提交拦截
- 提交时会自动检查是否修改了积分系统文件
- 如果检测到修改，会阻止提交
- 需要使用 `--no-verify` 强制提交

### 2. 哈希快照验证
- 记录每个文件的 SHA256 哈希值
- 可以随时验证文件是否被篡改
- 定期运行验证脚本检查完整性

### 3. 黑名单文档
- 明确列出所有保护的文件
- 说明保护原因和禁止的操作
- 提供正确的修改流程

## 📞 联系方式

如有疑问，请联系项目负责人：

- **项目负责人**：[待填写]
- **技术负责人**：[待填写]
- **紧急联系**：[待填写]

## 📋 使用指南

### 检查保护状态
```bash
# 验证积分系统文件完整性
pnpm verify-points
```

### 查看保护列表
```bash
# 查看受保护的文件列表
cat .protection/points-protected-files.txt

# 查看哈希快照
cat .protection/points-hashes.txt
```

### 强制修改（仅限紧急情况）
```bash
# 如果确实需要修改积分系统文件
git add <积分系统文件>
git commit --no-verify -m "fix: 说明紧急修改原因"

# 修改后更新哈希快照
sha256sum <修改的文件> >> .protection/points-hashes.txt
```

## ⚠️ 违规后果

### 违规修改积分系统文件可能导致：
- 积分计算错误
- 等级系统失效
- 数据丢失或不一致
- 用户体验严重受损
- 系统稳定性下降

### 责任追究：
- 轻微违规：口头警告
- 严重违规：书面警告
- 造成损失：承担相应责任

---

**文档版本**：v1.0
**创建日期**：2026-03-13
**锁定版本**：cf68f5e
**最后更新**：2026-03-13
