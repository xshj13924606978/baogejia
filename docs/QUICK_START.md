# 产品导入判重功能快速开始指南

## 当前状态

根据检测，您的数据库可能需要完成以下初始化步骤：

- ✅ `product_field_configs` 表已存在
- ❌ `is_duplicate_check` 列缺失（需要执行迁移）
- ❓ `import_logs` 表状态未知（需要执行迁移）

## 快速初始化步骤

### 第一步：执行数据库迁移

请登录 Supabase Dashboard，进入 SQL Editor，依次执行以下迁移文件：

#### 1. 添加判重配置字段（必须执行）

复制以下 SQL 并执行：

```sql
-- 添加 is_duplicate_check 字段
ALTER TABLE product_field_configs
ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;

-- 初始化默认判重配置（name 和 model）
UPDATE product_field_configs
SET is_duplicate_check = TRUE
WHERE field_key IN ('name', 'model');

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_product_field_configs_duplicate_check
ON product_field_configs(is_duplicate_check)
WHERE is_duplicate_check = TRUE;

COMMENT ON COLUMN product_field_configs.is_duplicate_check IS '标识该字段是否用于产品导入时的重复判断';
```

或者直接执行迁移文件：
```
database/migrations/005_product_duplicate_check.sql
```

#### 2. 创建导入日志表（可选，如果需要记录导入历史）

复制以下 SQL 并执行：

```sql
-- 创建导入日志表
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 导入基本信息
  file_name TEXT,
  file_type TEXT,
  total_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,

  -- 判重配置
  duplicate_config JSONB,

  -- 详细信息
  details JSONB,
  duration_ms INTEGER,

  -- 索引字段
  status TEXT DEFAULT 'completed',

  -- 时间戳
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at
ON import_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_user_id
ON import_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_import_logs_status
ON import_logs(status);

CREATE INDEX IF NOT EXISTS idx_import_logs_started_at
ON import_logs(started_at DESC);

-- 添加注释
COMMENT ON TABLE import_logs IS '产品导入日志表，记录所有导入操作的详细信息';

-- 创建视图：导入日志摘要
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
```

或者直接执行迁移文件：
```
database/migrations/007_import_logs.sql
```

### 第二步：验证初始化

执行以下 SQL 验证初始化是否成功：

```sql
-- 验证 is_duplicate_check 列是否存在
SELECT field_key, field_label, is_duplicate_check
FROM product_field_configs
ORDER BY display_order;
```

应该看到类似这样的结果：

| field_key | field_label | is_duplicate_check |
|-----------|-------------|-------------------|
| name | 产品名称 | true |
| model | 规格型号 | true |
| brand | 品牌 | false |
| price | 指导价 | false |
| ... | ... | ... |

如果 `name` 和 `model` 的 `is_duplicate_check` 为 `true`，说明初始化成功。

### 第三步：访问判重配置页面

1. 登录系统
2. 进入"产品库管理"页面
3. 点击"判重配置"或"字段配置"
4. 您应该能看到所有字段的配置界面，并且可以自定义判重规则

## 功能说明

### 判重配置功能

系统支持灵活配置判重规则，可以根据业务需求选择不同的字段组合：

#### 预设模板

1. **严格模式**：产品名称 + 规格型号 + 品牌
2. **标准模式**：产品名称 + 规格型号
3. **宽松模式**：仅产品名称
4. **增强模式**：产品名称 + 规格型号 + 品牌 + 供应商

#### 自定义规则

您可以自由选择多个字段的组合作为判重依据：
- 产品名称
- 规格型号
- 品牌
- 分类
- 价格
- 供应商
- 参数描述
- 单位

### 导入功能

支持导入 Excel 或 PDF 文件，系统会根据配置的判重规则自动识别并跳过重复产品。

导入时会记录：
- 导入文件名
- 总记录数
- 成功导入数
- 跳过数（重复）
- 失败数
- 导入耗时
- 详细的错误信息

## 常见问题

### Q1: 执行 SQL 时提示 "column does not exist"

**原因**: `is_duplicate_check` 列确实不存在，需要先执行 005 迁移。

**解决**: 确保先执行了"第一步：添加判重配置字段"中的 SQL 语句。

### Q2: 判重配置页面显示"数据库表结构不完整"

**原因**: 数据库缺少必要的列。

**解决**: 按照本指南的步骤执行迁移文件。

### Q3: 如何重置判重配置到默认值？

**方法1**: 在判重配置页面点击"恢复默认"按钮。

**方法2**: 执行以下 SQL：
```sql
UPDATE product_field_configs
SET is_duplicate_check = CASE WHEN field_key IN ('name', 'model') THEN TRUE ELSE FALSE END;
```

### Q4: 如何查看导入历史？

访问"产品库管理" → "导入日志"页面，可以看到所有导入操作的详细记录。

### Q5: 如何测试判重规则是否生效？

1. 在判重配置页面选择所需的判重字段
2. 点击"测试规则"按钮
3. 系统会显示当前的规则描述和使用的字段数量
4. 导入一个包含重复产品的 Excel 文件
5. 查看导入结果，应该能看到部分产品被跳过

## 下一步

初始化完成后，您可以：

1. **配置判重规则**: 根据业务需求选择合适的判重字段组合
2. **导入产品数据**: 使用导入功能批量导入产品
3. **查看导入日志**: 监控导入操作的结果
4. **优化判重规则**: 根据实际导入效果调整判重配置

## 技术支持

如果遇到问题，请参考：

- 数据库初始化指南: `docs/DATABASE_INIT.md`
- 数据库迁移说明: `docs/DATABASE_MIGRATIONS.md`
- 迁移文件目录: `database/migrations/`

## 相关API端点

- `POST /api/admin/init-product-field-configs` - 检测表是否存在
- `POST /api/admin/init-duplicate-check` - 检测判重列是否存在
- `GET /api/tables/products/duplicate-check-config` - 获取判重配置
- `PUT /api/tables/products/duplicate-check-config` - 更新判重配置
- `GET /api/tables/products/field-configs` - 获取所有字段配置
- `POST /api/tables/products/import` - 导入产品数据
