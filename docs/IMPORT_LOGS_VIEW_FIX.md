# 导入日志视图修复说明

---

> ⚠️ **Legacy / historical procedure — Do not execute manually（历史文档，禁止手工执行）**
>
> 本文档只记录历史背景与历史修复过程。**当前不得手工执行其中的任何 SQL / DDL**：
> 不得使用 Supabase SQL Editor、`exec_sql` RPC、psql、Management API，也不得复制/下载脚本后人工执行。
> 数据库结构变更的唯一受支持入口是 **Migration Runner**，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。
> 文中保留的 SQL 片段一律视为 **NON-EXECUTABLE HISTORICAL REFERENCE**，不是操作手册（runbook）。

---

## 🐛 问题描述

错误信息：`ERROR: 42P01: relation "import_logs_summary" does not exist`

说明 `import_logs_summary` 视图在数据库中不存在，但验证查询中试图访问它。

## ✅ 修复方案

### 历史方案（已关闭 / CLOSED，禁止执行）

> ⛔ 以下历史方案（执行完整初始化脚本、执行单独修复脚本、在 SQL Editor 手工 CREATE OR REPLACE VIEW）
> 均已关闭。视图与结构变更必须由受审 Migration Runner 迁移完成，见 docs/MIGRATION_RUNNER.md。
> 本文档中的 SQL 片段仅为 NON-EXECUTABLE HISTORICAL REFERENCE。

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs up
```

## 📊 视图说明

### 1. import_logs_summary（详细视图）

**用途**：显示每条导入记录的详细信息

**字段**：
- `id`: 导入记录ID
- `created_at`: 创建时间
- `file_name`: 文件名
- `file_type`: 文件类型
- `total_count`: 总记录数
- `imported_count`: 成功导入数
- `skipped_count`: 跳过数
- `failed_count`: 失败数
- `duration_ms`: 耗时（毫秒）
- `status`: 状态
- `started_at`: 开始时间
- `completed_at`: 完成时间
- `result_status`: 结果状态（部分失败/部分跳过/全部成功）
- `success_rate`: 成功率（百分比）

**使用示例**（应用只读查询示意；非修复步骤、非 manual migration）：
```sql
-- 查看最近的10条导入记录
SELECT * FROM import_logs_summary LIMIT 10;

-- 查看失败的导入记录
SELECT * FROM import_logs_summary WHERE failed_count > 0;
```

### 2. import_logs_daily_summary（汇总视图）

**用途**：按日期统计导入数据

**字段**：
- `import_date`: 导入日期
- `total_imports`: 导入次数
- `total_products`: 总产品数
- `total_imported`: 总成功导入数
- `total_skipped`: 总跳过数
- `total_failed`: 总失败数
- `avg_success_rate`: 平均成功率

**使用示例**（应用只读查询示意；非修复步骤、非 manual migration）：
```sql
-- 查看每日导入统计
SELECT * FROM import_logs_daily_summary;

-- 查看最近7天的导入趋势
SELECT * FROM import_logs_daily_summary WHERE import_date >= NOW() - INTERVAL '7 days';
```

## 🔍 验证方法（由受审迁移 / deployment verification 完成）

视图是否存在属于 **受审 migration 与部署校验** 的结果，不由人工执行 SQL 验证：

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs verify
```

历史排查片段（**NON-EXECUTABLE HISTORICAL REFERENCE — DO NOT RUN MANUALLY**）：

```sql
-- NON-EXECUTABLE HISTORICAL REFERENCE
-- SELECT viewname, schemaname, viewowner FROM pg_views WHERE viewname LIKE 'import_logs%' ORDER BY viewname;
```

期望结果（用于迁移 / 代码对照，非执行步骤）：
- `import_logs_summary`
- `import_logs_daily_summary`

## 💡 注意事项

1. **视图名称**：修复后创建了两个视图，分别用于不同场景
2. **数据依赖**：视图依赖于 `import_logs` 表，确保表已创建
3. **权限要求（历史）**：历史上手工执行 CREATE VIEW 需要适当权限；当前视图由受审 migration 创建，不由人工执行
4. **返回空记录**：如果还没有导入日志，查询视图会返回0条记录，这是正常的

## 📝 更新记录

- 2026-03-14: 创建修复脚本，添加两个导入日志视图
