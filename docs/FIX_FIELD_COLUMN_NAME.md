# 字段列名错误修复说明

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

### 方案一：执行完整初始化（推荐）

如果数据库表刚创建，可以删除并重新创建：

```sql
-- 删除旧表
DROP TABLE IF EXISTS product_field_configs;

-- 然后执行完整初始化脚本
-- database/migrations/COMPLETE_INIT.sql
```

### 方案二：执行列名修复脚本

如果数据库中已有数据，使用修复脚本：

```bash
1. 登录 Supabase Dashboard
2. 进入 SQL Editor
3. 执行 database/migrations/FIX_FIELD_COLUMN_NAME.sql
```

### 方案三：手动重命名列

在 Supabase SQL Editor 中执行：

```sql
-- 检查列是否存在
SELECT column_name FROM information_schema.columns
WHERE table_name = 'product_field_configs';

-- 如果 field_name 存在，重命名为 display_name
ALTER TABLE product_field_configs RENAME COLUMN field_name TO display_name;

-- 验证修改
SELECT column_name FROM information_schema.columns
WHERE table_name = 'product_field_configs';
```

## 📊 正确的表结构

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

## 🔍 验证方法

### 1. 检查列名

```sql
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'product_field_configs'
ORDER BY ordinal_position;
```

应该包含：
- `id`
- `field_key`
- `display_name`
- `field_label`
- `field_type`
- `is_required`
- `is_duplicate_check`
- `is_visible`
- `display_order`
- 等其他列

### 2. 检查数据

```sql
SELECT 
  field_key,
  display_name,
  field_label,
  is_required,
  is_duplicate_check,
  display_order
FROM product_field_configs
ORDER BY display_order;
```

应该返回12条记录。

### 3. 测试查询

```sql
-- 测试判重字段查询
SELECT * FROM product_field_configs 
WHERE is_duplicate_check = TRUE;

-- 应该返回 name, model, brand 三条记录
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
