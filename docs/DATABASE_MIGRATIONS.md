# 数据库迁移说明

---

> ⚠️ **Legacy / historical procedure — Do not execute manually（历史文档，禁止手工执行）**
>
> 本文档只记录历史背景与历史修复过程。**当前不得手工执行其中的任何 SQL / DDL**：
> 不得使用 Supabase SQL Editor、`exec_sql` RPC、psql、Management API，也不得复制/下载脚本后人工执行。
> 数据库结构变更的唯一受支持入口是 **Migration Runner**，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。
> 文中保留的 SQL 片段（含初始化脚本与回滚脚本）一律视为 **NON-EXECUTABLE HISTORICAL REFERENCE**，不是操作手册（runbook）。

---

## 迁移文件列表

本项目使用数据库迁移来管理数据库结构的变化。所有迁移文件位于 `database/migrations/` 目录。

### 现有迁移文件

| 迁移文件 | 版本 | 说明 | 依赖 |
|---------|------|------|------|
| `004_create_product_field_configs.sql` | v1.0.0 | 创建产品字段配置表 | 无 |
| `005_product_duplicate_check.sql` | v1.0.0 | 添加判重配置字段 | 004 |
| `007_import_logs.sql` | v1.0.0 | 创建导入日志表 | 无 |

## 迁移执行顺序（当前由 Migration Runner 统一管理）

> ⛔ 下列"人工按顺序执行迁移"的做法已关闭。迁移必须由 **Migration Runner** 按受审顺序执行并记录到
> `migration_records` 账本，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)：
>
> ```bash
> node scripts/migration-runner.mjs status
> node scripts/migration-runner.mjs up
> ```
>
> 以下文件清单仅作历史追溯（NON-EXECUTABLE HISTORICAL REFERENCE）。

### 历史迁移清单（repository / history reference，不是执行顺序）

> 以下仅为仓库历史记录，用于追溯某个结构是从哪份文件引入的；
> **不是** manual execution sequence，也不提供"执行时机 / 验证 SQL"步骤。
> 当前迁移的执行与验证一律由 Migration Runner 完成（status / up / verify）。

| 文件 | 历史说明 | 历史依赖 |
|------|---------|---------|
| `004_create_product_field_configs.sql` | 创建 `product_field_configs` 表 | 无 |
| `005_product_duplicate_check.sql` | 添加 `is_duplicate_check` 字段 | 004 |
| `007_import_logs.sql` | 创建 `import_logs` 表 | 无 |

## 快速初始化脚本（已关闭 / CLOSED）

> ⛔ 禁止执行。以下脚本为 **NON-EXECUTABLE HISTORICAL REFERENCE**，
> 仅说明历史上一次性初始化包含哪些对象；当前应通过受审 Migration Runner 迁移达成同样状态。

```sql
-- ============================================================================
-- 产品库功能完整初始化脚本
-- ============================================================================

-- 1. 创建产品字段配置表
CREATE TABLE IF NOT EXISTS product_field_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) UNIQUE NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  is_duplicate_check BOOLEAN DEFAULT FALSE,
  is_visible BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  options JSONB,
  validation_rules JSONB,
  default_value TEXT,
  placeholder TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- 插入默认字段配置
INSERT INTO product_field_configs (field_key, field_name, field_label, field_type, is_required, is_duplicate_check, is_visible, display_order) VALUES
('name', '产品名称', 'product_name', 'text', TRUE, TRUE, TRUE, 1),
('model', '规格型号', 'model', 'text', FALSE, TRUE, TRUE, 2),
('brand', '品牌', 'brand', 'text', FALSE, FALSE, TRUE, 3),
('price', '指导价', 'price', 'number', TRUE, FALSE, TRUE, 4),
('cost_price', '成本价', 'cost_price', 'number', FALSE, FALSE, FALSE, 5),
('min_price', '最低售价', 'min_price', 'number', FALSE, FALSE, FALSE, 6),
('parameter_description', '参数描述', 'parameter_description', 'text', FALSE, FALSE, TRUE, 7),
('description', '描述', 'description', 'text', FALSE, FALSE, TRUE, 8),
('unit', '单位', 'unit', 'text', FALSE, FALSE, TRUE, 9),
('stock', '库存', 'stock', 'number', FALSE, FALSE, TRUE, 10),
('category', '分类', 'category', 'text', FALSE, FALSE, TRUE, 11),
('supplier', '供应商', 'supplier', 'text', FALSE, FALSE, TRUE, 12),
('contact_person', '联系人', 'contact_person', 'text', FALSE, FALSE, TRUE, 13),
('contact_phone', '联系电话', 'contact_phone', 'text', FALSE, FALSE, TRUE, 14),
('image_url', '图片', 'image_url', 'text', FALSE, FALSE, TRUE, 15)
ON CONFLICT (field_key) DO NOTHING;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_product_field_configs_field_key ON product_field_configs(field_key);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_required ON product_field_configs(is_required);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_duplicate_check ON product_field_configs(is_duplicate_check);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_display_order ON product_field_configs(display_order);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_visible ON product_field_configs(is_visible);

-- 添加注释
COMMENT ON TABLE product_field_configs IS '产品字段配置表，管理产品库的字段显示、必填、判重等配置';

-- 2. 创建导入日志表
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name TEXT,
  file_type TEXT,
  total_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  duplicate_config JSONB,
  details JSONB,
  duration_ms INTEGER,
  status TEXT DEFAULT 'completed',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at ON import_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_logs_user_id ON import_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);
CREATE INDEX IF NOT EXISTS idx_import_logs_started_at ON import_logs(started_at DESC);

-- 添加注释
COMMENT ON TABLE import_logs IS '产品导入日志表，记录所有导入操作的详细信息';

-- 3. 创建导入日志摘要视图
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

COMMENT ON VIEW import_logs_summary IS '导入日志摘要视图，包含导入结果的统计信息';

-- ============================================================================
-- 初始化完成
-- ============================================================================
```

## 验证迁移（由 Migration Runner 完成）

迁移是否已应用、账本是否一致由 Migration Runner 判定，不由人工执行 SQL 验证：

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs verify
```

## 回滚说明（已关闭 / CLOSED）

> ⛔ 禁止手工执行回滚 DDL。回滚必须通过 Migration Runner 的受审 `down` 流程：
>
> ```bash
> node scripts/migration-runner.mjs down
> ```
>
> 以下 SQL 仅为 **NON-EXECUTABLE HISTORICAL REFERENCE**。

### 回滚 004（product_field_configs 表）

```sql
-- ⚠️ 警告：此操作将删除所有产品字段配置数据
DROP TABLE IF EXISTS product_field_configs CASCADE;
```

### 回滚 007（import_logs 表）

```sql
-- ⚠️ 警告：此操作将删除所有导入日志数据
DROP TABLE IF EXISTS import_logs CASCADE;
DROP VIEW IF EXISTS import_logs_summary;
```

## 常见问题

### Q: 迁移文件名中的数字是什么意思？

A: 数字代表迁移的版本号和执行顺序，例如：
- `004` = 版本 0.0.4
- `005` = 版本 0.0.5
- `007` = 版本 0.0.7

### Q: 为什么有些数字跳过了？

A: 可能是因为：
- 该迁移已废弃或合并到其他迁移中
- 该迁移由其他系统创建（如 `scripts/migrations/` 下的迁移）

### Q: 如何检查哪些迁移已执行？

A: 当前由 Migration Runner 的 `migration_records` 账本记录已执行的受审迁移：
1. 查看 `node scripts/migration-runner.mjs status`
2. 校验 `node scripts/migration-runner.mjs verify`
3. 定期备份数据库（备份仍然是推荐的运维实践）

### Q: 迁移执行失败怎么办？

A:
1. 检查错误信息
2. 确认前置依赖是否已执行
3. 检查数据库权限
4. 联系部署管理员通过 Migration Runner 执行受审迁移（禁止手动执行 SQL 语句）

## 最佳实践

1. **执行前备份**: 执行迁移前务必备份数据库
2. **测试环境**: 先在测试环境执行迁移
3. **逐步执行**: 由 Migration Runner 按受审顺序逐个应用迁移，便于定位问题
4. **验证结果**: 每次迁移后用 `node scripts/migration-runner.mjs verify` 校验账本一致性
5. **记录日志**: 记录每次迁移的执行时间和结果

## 获取帮助

如遇到问题，请查看：
- 数据库初始化指南：`docs/DATABASE_INIT.md`
- 初始化 API：`src/app/api/admin/init-product-field-configs/route.ts`
- 判重配置组件：`src/components/admin/duplicate-check-config.tsx`
