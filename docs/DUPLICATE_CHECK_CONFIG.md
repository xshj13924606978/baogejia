# 产品导入判重配置使用说明

---

> ⚠️ **Legacy / historical procedure — Do not execute manually（历史文档，禁止手工执行）**
>
> 本文档只记录历史背景与历史修复过程。**当前不得手工执行其中的任何 SQL / DDL**：
> 不得使用 Supabase SQL Editor、`exec_sql` RPC、psql、Management API，也不得复制/下载脚本后人工执行。
> 数据库结构变更的唯一受支持入口是 **Migration Runner**，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。
> 文中保留的 SQL 片段一律视为 **NON-EXECUTABLE HISTORICAL REFERENCE**，不是操作手册（runbook）。

---

## 功能概述

产品导入判重配置功能允许管理员自定义判断产品重复的字段组合，解决了因名称/品牌/规格一致但参数不同导致无法导入的问题。

## 功能特点

- ✅ 灵活的判重字段选择（支持多选）
- ✅ 可视化配置界面
- ✅ 实时生效（无需重启服务）
- ✅ 兼容现有导入流程
- ✅ 提供数据库初始化引导

## 使用步骤

### 1. 访问判重配置页面

登录管理员账号后，进入：
- **产品库管理** → **判重字段配置**

或直接访问：`/admin/products`

### 2. 初始化数据库（首次使用时）

如果是首次使用该功能，可能会看到"数据库初始化"提示框，需要执行以下步骤：

> ⛔ **已关闭 / CLOSED**：不得登录 SQL Editor 执行任何 SQL（也无需复制/下载 SQL）。
> 当前判重配置页面在数据库结构未就绪时显示 **fail-closed 状态**：
> "数据库结构尚未通过受审迁移准备完成（database schema requires an audited migration）"，
> 请联系部署管理员执行正式 Migration Runner 流程（见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)）。
> 应用侧不再提供复制 SQL / 下载 SQL / SQL Editor 指引，也不再在业务请求中自动执行 DDL。

SQL 语句示例（NON-EXECUTABLE HISTORICAL REFERENCE，禁止执行）：
```sql
-- 添加 is_duplicate_check 列
ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;

-- 设置默认判重字段（name 和 model）
UPDATE product_field_configs SET is_duplicate_check = TRUE WHERE field_key IN ('name', 'model');
```

### 3. 配置判重字段

在判重字段配置页面中：

1. 勾选需要参与判重的字段（至少选择一个）
2. 点击"保存配置"按钮
3. 配置完成后，后续的产品导入将使用新的判重规则

### 4. 测试判重效果

配置完成后，可以导入包含重复字段的产品进行测试：

- 如果产品在判重字段上的值完全一致 → 会被判断为重复，跳过导入
- 如果产品在判重字段上的值有差异 → 会作为新产品导入

## 常见判重配置场景

### 场景 1：仅按产品名称判重

**适用场景**：同一产品名称下不允许重复

**配置**：勾选 `产品名称`

**效果**：
- 导入"提升泵 CR5-12" → 成功
- 再次导入"提升泵 CR5-12" → 判定为重复，跳过

### 场景 2：按名称 + 型号判重（推荐）

**适用场景**：同一产品名称下，不同型号视为不同产品

**配置**：勾选 `产品名称` + `规格型号`

**效果**：
- 导入"提升泵 CR5-12" → 成功
- 再次导入"提升泵 CR5-12" → 判定为重复，跳过
- 导入"提升泵 CR5-15" → 成功（型号不同）

### 场景 3：按名称 + 型号 + 品牌判重

**适用场景**：同一产品名称和型号，但不同品牌视为不同产品

**配置**：勾选 `产品名称` + `规格型号` + `品牌`

**效果**：
- 导入"提升泵 CR5-12 格兰富" → 成功
- 导入"提升泵 CR5-12 凯士比" → 成功（品牌不同）
- 导入"提升泵 CR5-12 格兰富" → 判定为重复，跳过

### 场景 4：仅按品牌判重

**适用场景**：不允许重复导入同一品牌的产品

**配置**：勾选 `品牌`

**效果**：
- 导入"格兰富 提升泵" → 成功
- 导入"格兰富 搅拌罐" → 判定为重复，跳过（品牌相同）

## API 接口说明

### 获取判重配置

**接口**：`GET /api/tables/products/duplicate-check-config`

**响应**：
```json
{
  "success": true,
  "data": {
    "allFields": [
      {
        "id": 1,
        "field_key": "name",
        "field_label": "产品名称",
        "is_required": true,
        "is_duplicate_check": true
      }
    ],
    "duplicateCheckFields": [
      {
        "id": 1,
        "field_key": "name",
        "field_label": "产品名称",
        "is_duplicate_check": true
      }
    ]
  }
}
```

### 更新判重配置

**接口**：`PUT /api/tables/products/duplicate-check-config`

**请求体**：
```json
{
  "duplicateCheckFields": ["name", "model", "brand"]
}
```

**响应**：
```json
{
  "success": true,
  "message": "成功更新判重配置，共 3 个字段参与判重",
  "data": {
    "duplicateCheckFields": [...],
    "fieldKeys": ["name", "model", "brand"]
  }
}
```

## 判重逻辑说明

### 判重原理

系统使用**AND** 组合所有选中的判重字段进行查询：

```sql
SELECT * FROM products
WHERE field1 = '值1'
  AND field2 = '值2'
  AND field3 = '值3'
  ...
```

只有当**所有**判重字段的值都完全匹配时，才会被判定为重复。

### 默认配置

如果用户未配置判重字段（或数据库初始化未完成），系统使用默认配置：

- **默认判重字段**：`name` + `model`

## 注意事项

1. **至少选择一个判重字段**：保存时会验证，不能全不选
2. **字段值匹配规则**：使用**严格相等**（`=`）进行匹配，区分大小写
3. **NULL 值处理**：如果某个判重字段值为空或 NULL，会跳过该条件的判断
4. **配置实时生效**：修改配置后，立即对后续的导入生效
5. **不影响已有数据**：修改判重规则不会影响数据库中已有的产品数据

## 故障排查

### 问题 1：加载配置时提示"数据库表结构不完整"

**原因**：`product_field_configs` 表缺少 `is_duplicate_check` 列

**解决**：
1. 页面会显示 fail-closed 状态：database schema requires an audited migration
2. 联系部署管理员执行正式 Migration Runner 流程（禁止在 SQL Editor 手工执行）
3. 迁移完成后刷新页面

### 问题 2：保存配置后仍然使用旧的判重规则

**原因**：浏览器缓存或组件未重新加载

**解决**：
1. 点击"刷新"按钮
2. 或刷新页面

### 问题 3：导入的产品仍然被误判为重复

**原因**：
1. 判重字段配置不正确
2. 数据库中已存在相同产品

**解决**：
1. 检查判重配置是否符合预期
2. 在产品列表中搜索已存在的产品
3. 修改判重字段或删除已有产品后重新导入

## 数据库迁移（已关闭 / CLOSED）

> ⛔ 禁止手动执行。迁移必须通过 Migration Runner 执行（`node scripts/migration-runner.mjs up`）。
> 以下 SQL 仅作历史追溯（NON-EXECUTABLE HISTORICAL REFERENCE）。

```sql
-- 文件位置：database/migrations/005_product_duplicate_check.sql

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

## 相关文件

- **API 接口**：
  - `src/app/api/tables/products/duplicate-check-config/route.ts`
  - `src/app/api/tables/products/import/route.ts`
  - `src/app/api/admin/init-duplicate-check/route.ts`

- **前端组件**：
  - `src/components/admin/duplicate-check-config.tsx`
  - `src/app/admin/products/page.tsx`

- **数据库迁移**：
  - `database/migrations/005_product_duplicate_check.sql`

## 技术支持

如遇到问题，请检查：

1. 浏览器控制台是否有错误
2. 服务器日志（`/app/work/logs/bypass/app.log`）
3. Supabase 数据库表结构是否完整
4. 环境变量配置是否正确
