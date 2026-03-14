# 数据库初始化指南

## 问题说明

如果您遇到以下错误：
```
Error: Failed to run sql query: ERROR: 42P01: relation "product_field_configs" does not exist
```

这说明 `product_field_configs` 表还不存在于数据库中。

## 解决方案

### 方法1：在 Supabase Dashboard 中手动执行（推荐）

1. **登录 Supabase Dashboard**
   - 访问 https://supabase.com/dashboard
   - 选择您的项目

2. **进入 SQL Editor**
   - 在左侧菜单中点击 "SQL Editor"
   - 点击 "New query" 创建新查询

3. **执行初始化 SQL**

复制以下 SQL 语句并执行：

```sql
-- 创建产品字段配置表
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
```

4. **执行完成后**
   - 返回产品库管理页面
   - 刷新页面
   - 判重配置功能应该可以正常使用了

### 方法2：使用迁移文件

如果您使用数据库迁移工具，可以直接执行以下迁移文件：

```
database/migrations/004_create_product_field_configs.sql
```

## 表结构说明

### product_field_configs 表

该表用于管理产品库的字段配置，包括：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| field_key | VARCHAR(50) | 字段标识（唯一） |
| field_name | VARCHAR(100) | 字段名称（对应数据库字段名） |
| field_label | VARCHAR(100) | 字段显示标签 |
| field_type | VARCHAR(20) | 字段类型：text, number, date, boolean, select |
| is_required | BOOLEAN | 是否必填字段 |
| is_duplicate_check | BOOLEAN | 是否参与判重 |
| is_visible | BOOLEAN | 是否可见 |
| display_order | INTEGER | 显示顺序 |
| options | JSONB | 字段选项（用于 select 类型） |
| validation_rules | JSONB | 验证规则 |
| default_value | TEXT | 默认值 |
| placeholder | TEXT | 占位符 |
| description | TEXT | 字段描述 |

## 验证安装

执行以下 SQL 验证表是否创建成功：

```sql
-- 查看表是否存在
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'product_field_configs';

-- 查看配置数据
SELECT * FROM product_field_configs ORDER BY display_order;
```

应该看到 15 条默认字段配置记录。

## 常见问题

### Q: 执行 SQL 时提示 "relation does not exist"

A: 请确保您选择的是正确的数据库项目，并且有足够的权限执行 CREATE TABLE。

### Q: 执行 SQL 时提示 "permission denied"

A: 请检查您的 Supabase 账户是否有该项目的数据库管理员权限。

### Q: 初始化后还是报错

A:
1. 检查 SQL 是否完全执行成功
2. 刷新浏览器页面
3. 清除浏览器缓存
4. 如果问题仍然存在，请查看浏览器控制台错误信息

## 下一步

初始化完成后，您可以：

1. 访问"产品库管理"页面
2. 配置判重规则字段
3. 选择预设模板或自定义字段组合
4. 测试判重规则效果
5. 开始导入产品数据

## 联系支持

如果遇到其他问题，请查看：
- 数据库迁移文件：`database/migrations/004_create_product_field_configs.sql`
- 初始化 API：`src/app/api/admin/init-product-field-configs/route.ts`
