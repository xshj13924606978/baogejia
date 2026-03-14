# 导入日志视图修复说明

## 🐛 问题描述

错误信息：`ERROR: 42P01: relation "import_logs_summary" does not exist`

说明 `import_logs_summary` 视图在数据库中不存在，但验证查询中试图访问它。

## ✅ 修复方案

### 方案一：执行完整初始化脚本（推荐）

如果您还没有执行完整的数据库初始化，直接执行完整脚本即可：

```bash
# 文件位置
database/migrations/COMPLETE_INIT.sql
```

执行步骤：
1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 打开 `database/migrations/COMPLETE_INIT.sql` 文件
4. 复制全部内容并执行
5. 验证结果

### 方案二：执行单独修复脚本

如果您已经执行了初始化，但视图创建失败，可以单独执行修复脚本：

```bash
# 文件位置
database/migrations/FIX_IMPORT_LOGS_VIEW.sql
```

执行步骤：
1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 打开 `database/migrations/FIX_IMPORT_LOGS_VIEW.sql` 文件
4. 复制全部内容并执行
5. 验证结果

### 方案三：手动执行SQL

在 Supabase SQL Editor 中执行以下SQL：

```sql
-- 创建导入日志摘要视图（详细视图）
CREATE OR REPLACE VIEW import_logs_summary AS
SELECT
  id,
  created_at,
  file_name,
  file_type,
  total_count,
  imported_count,
  skipped_count,
  failed_count,
  duration_ms,
  status,
  started_at,
  completed_at,
  CASE
    WHEN failed_count > 0 THEN '部分失败'
    WHEN skipped_count > 0 THEN '部分跳过'
    ELSE '全部成功'
  END AS result_status,
  CASE
    WHEN total_count > 0 THEN ROUND((imported_count::FLOAT / total_count) * 100, 2)
    ELSE 0
  END AS success_rate
FROM import_logs
ORDER BY created_at DESC;

-- 创建导入日志每日汇总视图（统计视图）
CREATE OR REPLACE VIEW import_logs_daily_summary AS
SELECT
  DATE(created_at) as import_date,
  COUNT(*) as total_imports,
  SUM(total_count) as total_products,
  SUM(imported_count) as total_imported,
  SUM(skipped_count) as total_skipped,
  SUM(failed_count) as total_failed,
  AVG(CASE WHEN total_count > 0 THEN (imported_count::float / total_count::float) * 100 ELSE 0 END) as avg_success_rate
FROM import_logs
GROUP BY DATE(created_at)
ORDER BY import_date DESC;
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

**使用示例**：
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

**使用示例**：
```sql
-- 查看每日导入统计
SELECT * FROM import_logs_daily_summary;

-- 查看最近7天的导入趋势
SELECT * FROM import_logs_daily_summary WHERE import_date >= NOW() - INTERVAL '7 days';
```

## 🔍 验证方法

执行以下SQL验证视图是否创建成功：

```sql
-- 查看所有导入日志相关的视图
SELECT
  viewname AS "视图名称",
  schemaname AS "模式名",
  viewowner AS "所有者"
FROM pg_views
WHERE viewname LIKE 'import_logs%'
ORDER BY viewname;
```

应该看到：
- `import_logs_summary`
- `import_logs_daily_summary`

## 💡 注意事项

1. **视图名称**：修复后创建了两个视图，分别用于不同场景
2. **数据依赖**：视图依赖于 `import_logs` 表，确保表已创建
3. **权限要求**：执行CREATE VIEW需要适当的权限
4. **返回空记录**：如果还没有导入日志，查询视图会返回0条记录，这是正常的

## 📝 更新记录

- 2026-03-14: 创建修复脚本，添加两个导入日志视图
