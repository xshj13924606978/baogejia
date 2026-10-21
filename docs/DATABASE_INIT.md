# 数据库初始化指南

---

> ⚠️ **Legacy / historical procedure — Do not execute manually（历史文档，禁止手工执行）**
>
> 本文档只记录历史背景与历史修复过程。**当前不得手工执行其中的任何 SQL / DDL**：
> 不得使用 Supabase SQL Editor、`exec_sql` RPC、psql、Management API，也不得复制/下载脚本后人工执行。
> 数据库结构变更的唯一受支持入口是 **Migration Runner**，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。
> 文中保留的 SQL 片段一律视为 **NON-EXECUTABLE HISTORICAL REFERENCE**，不是操作手册（runbook）。

---

## 问题说明

如果您遇到以下错误：
```
Error: Failed to run sql query: ERROR: 42P01: relation "product_field_configs" does not exist
```

这说明 `product_field_configs` 表还不存在于数据库中。

## 解决方案

### 方法1（已关闭 / CLOSED，禁止执行）：在 Supabase Dashboard 中手动执行

> ⛔ 该方法要求人工在 SQL Editor 中执行 DDL，属于 migration bypass，已关闭。
> 下方步骤与 SQL 仅作为 **NON-EXECUTABLE HISTORICAL REFERENCE**（历史参考，禁止执行）。

> ⛔ 已关闭（CLOSED）：原步骤为「登录 Supabase Dashboard → 进入 SQL Editor → 复制并执行初始化 SQL」。
> 该流程属于 migration bypass，已整体停用。

> ⛔ 下方 SQL 为 **NON-EXECUTABLE HISTORICAL REFERENCE**，禁止复制/粘贴到任何 SQL 执行入口。

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

### 当前唯一受支持做法：通过 Migration Runner 执行受审迁移

迁移文件必须作为**受审 migration** 提交，并由 Migration Runner 记录到 `migration_records` 账本；
不得由人工执行（SQL Editor / `exec_sql` / psql / Management API 一律禁止）。

```bash
# 查看迁移状态（受审账本）
node scripts/migration-runner.mjs status

# 执行受审迁移
node scripts/migration-runner.mjs up

# 校验 bootstrap / 账本一致性
node scripts/migration-runner.mjs verify
```

历史迁移文件（仅供追溯，禁止手工执行）：

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

## 验证安装（由受审迁移 / deployment verification 完成）

表是否已就绪 **不是** 由人工执行 SQL 验证出来的，而是 **受审 migration 与部署校验（deployment verification）** 的结果：

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs verify
```

应用侧在结构未就绪时 **fail-closed**，返回 `database schema requires an audited migration`，
不会要求管理员手工执行任何 SQL。本文档不再提供人工执行的验证 SQL 步骤。

## 常见问题

### Q（历史问题）：曾在执行 SQL 时提示 "relation does not exist"

A: 历史问题。当前**不得**手工执行 `CREATE TABLE`；请通过 Migration Runner 执行受审迁移（见 `docs/MIGRATION_RUNNER.md`）。

### Q（历史问题）：曾在执行 SQL 时提示 "permission denied"

A: 历史问题。当前不允许通过任何人工 SQL 入口变更结构；请联系部署管理员执行正式 Migration Runner 流程。

### Q: 初始化后还是报错

A:
1. 用 `node scripts/migration-runner.mjs status` / `verify` 确认受审迁移状态
2. 刷新浏览器页面
3. 清除浏览器缓存
4. 如果问题仍然存在，请联系部署管理员（应用已 fail-closed，不会要求人工执行 SQL）

## 下一步

初始化完成后，您可以：

1. 访问"产品库管理"页面
2. 配置判重规则字段
3. 选择预设模板或自定义字段组合
4. 测试判重规则效果
5. 开始导入产品数据

## 联系支持

如果遇到其他问题，请联系部署管理员，通过 **Migration Runner** 执行受审迁移处理（见 `docs/MIGRATION_RUNNER.md`）。

历史参考（**非**受支持的结构变更入口）：
- 历史迁移文件：`database/migrations/004_create_product_field_configs.sql`
- 历史初始化 API：`src/app/api/admin/init-product-field-configs/route.ts`（不作为受支持入口）
