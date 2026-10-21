# 产品导入判重功能快速开始指南

---

> ⚠️ **Legacy / historical procedure — Do not execute manually（历史文档，禁止手工执行）**
>
> 本文档只记录历史背景与历史修复过程。**当前不得手工执行其中的任何 SQL / DDL**：
> 不得使用 Supabase SQL Editor、`exec_sql` RPC、psql、Management API，也不得复制/下载脚本后人工执行。
> 数据库结构变更的唯一受支持入口是 **Migration Runner**，见 [`docs/MIGRATION_RUNNER.md`](./MIGRATION_RUNNER.md)。
> 文中保留的 SQL 片段一律视为 **NON-EXECUTABLE HISTORICAL REFERENCE**，不是操作手册（runbook）。

---

## 当前状态

根据检测，您的数据库可能需要完成以下初始化步骤：

- ✅ `product_field_configs` 表已存在
- ❌ `is_duplicate_check` 列缺失（需要执行迁移）
- ❓ `import_logs` 表状态未知（需要执行迁移）

## 快速初始化步骤

### 第一步（已关闭 / CLOSED）：数据库结构准备 —— 禁止手工执行迁移

> ⛔ 已关闭：不得登录 Supabase Dashboard / SQL Editor 执行任何迁移 SQL，也不得复制粘贴脚本执行。
> 数据库结构变更的唯一受支持入口是 Migration Runner，见 docs/MIGRATION_RUNNER.md：
>
> ```bash
> node scripts/migration-runner.mjs status
> node scripts/migration-runner.mjs up
> ```
>
> 下方历史 SQL 与迁移文件清单仅为 NON-EXECUTABLE HISTORICAL REFERENCE。

### 第二步：验证初始化（由 Migration Runner / deployment verification 完成）

初始化是否完成由 Migration Runner 与部署校验判定，不由人工执行 SQL 验证：

```bash
node scripts/migration-runner.mjs status
node scripts/migration-runner.mjs verify
```

期望状态（用于对照，非执行步骤）：

| field_key | field_label | is_duplicate_check |
|-----------|-------------|-------------------|
| name | 产品名称 | true |
| model | 规格型号 | true |
| brand | 品牌 | false |
| price | 指导价 | false |
| ... | ... | ... |

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

### Q1（历史问题）：曾在执行 SQL 时提示 "column does not exist"

**原因（历史）**: `is_duplicate_check` 列不存在。

**当前解决路径**: 通过受审 migration + Migration Runner 准备结构（`node scripts/migration-runner.mjs up`）；
不得手工执行任何 SQL 语句。

### Q2: 判重配置页面显示"数据库表结构不完整"

**原因**: 数据库结构尚未通过受审迁移准备完成（schema prerequisite 缺失）。

**解决**: 联系部署管理员通过 Migration Runner 执行受审迁移；页面显示 fail-closed 状态，不提供 SQL。

### Q3: 如何重置判重配置到默认值？

**方法1**: 在判重配置页面点击"恢复默认"按钮。

**方法2（已关闭）**：历史上曾提供手工 UPDATE SQL 重置配置 —— 已关闭，请使用方法1（页面"恢复默认"按钮）。

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
