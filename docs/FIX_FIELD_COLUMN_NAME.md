# 字段列名错误修复说明

---

> ⚠️ **Legacy / historical procedure — Do not execute manually（历史文档，禁止手工执行）**
>
> 本文档只记录历史背景与历史修复过程。**当前不得手工执行其中的任何 SQL / DDL**：
> 不得使用 Supabase SQL Editor、`exec_sql` RPC、psql、Management API，也不得复制/下载脚本后人工执行。
> 数据库结构变更的唯一受支持入口是 **Migration Runner**，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。
> 文中保留的 SQL 片段一律视为 **NON-EXECUTABLE HISTORICAL REFERENCE**，不是操作手册（runbook）。

---

## 🐛 问题描述

错误信息：`ERROR: 42703: column "field_key" does not exist LINE 8: WHERE field_key IN ('name', 'model');`

或

错误信息：`ERROR: 42703: column "field_name" does not exist`

说明SQL脚本中使用的列名与数据库表实际的列名不一致。

## 🔍 问题原因

代码期望的列名：
- `field_key` (字段唯一标识符)
- `display_name` (字段显示名称，中文)
- `field_label` (字段英文标签，对应数据库字段名)

但某些SQL脚本中使用的是：
- `field_name` (不推荐)

## ✅ 修复方案

### 历史方案（已关闭 / CLOSED，禁止执行）

> ⛔ 以下三种历史方案（DROP/CREATE 重建、执行列名修复脚本、在 SQL Editor 手工 RENAME）均已关闭。
> 列名与结构变更必须由受审 Migration Runner 迁移完成，见 docs/MIGRATION_RUNNER.md。
> 本文档中的 SQL 片段仅为 NON-EXECUTABLE HISTORICAL REFERENCE。

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs up
```

## 📊 正确的表结构（schema 说明 — NON-EXECUTABLE HISTORICAL REFERENCE）

> 以下 DDL 仅用于说明目标表结构（应由受审 migration 达成），**DO NOT RUN MANUALLY**。

```sql
CREATE TABLE product_field_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) UNIQUE NOT NULL,        -- 字段唯一标识符
  display_name VARCHAR(100) NOT NULL,           -- 字段显示名称（中文）
  field_label VARCHAR(100) NOT NULL,            -- 字段英文标签
  field_type VARCHAR(20) NOT NULL,              -- 字段类型
  is_required BOOLEAN DEFAULT FALSE,            -- 是否必填
  is_duplicate_check BOOLEAN DEFAULT FALSE,     -- 是否用于判重
  is_visible BOOLEAN DEFAULT TRUE,              -- 是否可见
  display_order INTEGER DEFAULT 0,              -- 显示顺序
  options JSONB,                                -- 选项
  validation_rules JSONB,                       -- 验证规则
  default_value TEXT,                           -- 默认值
  placeholder TEXT,                             -- 占位符
  description TEXT,                             -- 描述
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);
```

## 🔍 验证方法（由受审迁移 / deployment verification 完成）

列名与结构是否就绪属于 **受审 migration 与部署校验** 的结果，不由人工执行 SQL 验证：

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs verify
```

历史排查片段（**NON-EXECUTABLE HISTORICAL REFERENCE — DO NOT RUN MANUALLY**）：

### 1. 检查列名（历史片段，已注释）

```sql
-- NON-EXECUTABLE HISTORICAL REFERENCE
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'product_field_configs' ORDER BY ordinal_position;
```

期望列名集合（用于代码 / 迁移对照，非执行步骤）：
- `id`、`field_key`、`display_name`、`field_label`、`field_type`
- `is_required`、`is_duplicate_check`、`is_visible`、`display_order`

### 2. 检查数据（历史片段，已注释）

```sql
-- NON-EXECUTABLE HISTORICAL REFERENCE
-- SELECT field_key, display_name, field_label, is_required, is_duplicate_check, display_order FROM product_field_configs ORDER BY display_order;
```

### 3. 测试查询（历史片段，已注释）

```sql
-- NON-EXECUTABLE HISTORICAL REFERENCE
-- SELECT * FROM product_field_configs WHERE is_duplicate_check = TRUE;
```

## 📝 代码中的字段使用

### TypeScript 接口定义

```typescript
interface FieldConfig {
  id: string;
  field_key: string;
  display_name: string;      // 使用 display_name
  field_label: string;
  is_required: boolean;
  is_duplicate_check?: boolean;
  display_order?: number;
}
```

### 显示字段标签

```typescript
// 优先使用 fieldLabelMap，其次使用 display_name，最后使用 field_label
{fieldLabelMap[field.field_key] || field.display_name || field.field_label || field.field_key}
```

## 💡 注意事项

1. **列名一致性**：确保所有SQL脚本、TypeScript代码、API都使用 `display_name`
2. **数据迁移**：如果已有数据，重命名列不会丢失数据
3. **索引影响**：重命名列不会影响索引，但建议重建相关索引
4. **外键影响**：如果有其他表引用此列，需要检查外键关系

## 🔄 修复记录

- 2026-03-14: 统一使用 `display_name` 列名
  - 修改数据库表结构
  - 更新所有 SQL 脚本
  - 更新 TypeScript 接口定义
  - 更新 API 代码

## 📚 相关文件

- `database/migrations/COMPLETE_INIT.sql` - 完整初始化脚本
- `database/migrations/FIX_FIELD_COLUMN_NAME.sql` - 列名修复脚本
- `src/app/api/admin/init-duplicate-check/route.ts` - 初始化API
- `src/app/api/admin/init-product-field-configs/route.ts` - 字段配置API
- `src/components/admin/duplicate-check-config.tsx` - 判重配置组件
